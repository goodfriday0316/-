import { useEffect, useRef, useState } from "react";
import {
  ArrowUpFromLine,
  Shield,
  X,
  Trash2,
  FileJson,
  ArrowDownToLine,
} from "lucide-react";
import { importImageZip, type ImageReport } from "./image-import";
import { convertLocalFile } from "./convert-local-file";
import { catalog } from "./catalog";
import {
  loadLocalLibrary,
  saveLocalLibrary,
  clearLocalLibrary,
  type LocalLibrary,
} from "./local-library";
import type { RawImportReport } from "./raw-adapter";

type Props = {
  onLibraryChange: (value: LocalLibrary | null) => void;
  onMessage: (message: string) => void;
};
const issueLabels: Record<string, string> = {
  "skill-record": "스킬 제외",
  "non-item-record": "아이템 아님",
  "debug-marker": "디버그 제외",
  "template-marker": "템플릿 제외",
  "source-declared-inactive": "파일에서 비활성으로 표시됨",
  "unknown-hero": "알 수 없는 영웅",
  "unknown-size": "알 수 없는 크기",
  "source-id-conflict": "고유 ID 불일치",
  "conflicting-duplicate-id": "중복 ID의 내용 충돌",
  "identical-duplicate-id": "동일 ID 중복 제외",
  "no-supported-tier-data": "지원 가능한 등급 정보 없음",
  "missing-declared-tier-data": "선언된 등급의 원본 데이터 누락",
  "record-key-too-long": "항목 이름 키가 너무 김",
};
export function LocalCatalogPanel({ onLibraryChange, onMessage }: Props) {
  const imagePicker = useRef<HTMLInputElement>(null);
  const [imageProgress, setImageProgress] = useState('');
  const [imageReport, setImageReport] = useState<ImageReport | null>(null);
  async function selectImages(file?: File) {
    if (!file || !library) return;
    setBusy(true); setImageReport(null);
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.quota && estimate.quota - (estimate.usage || 0) < file.size * 1.2) throw Error('브라우저 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도하세요.');
      await navigator.storage?.persist?.().catch(() => false);
      const report = await importImageZip(file, library.items, setImageProgress);
      setImageReport(report);
      setImageProgress(`매칭·저장 ${report.matched} / 실패 ${report.failed} / 이미지 없는 아이템 ${report.missingItemIds.length}`);
    } catch(e) { setImageProgress(e instanceof Error ? e.message : '이미지 가져오기 실패'); }
    finally {setBusy(false);if(imagePicker.current) imagePicker.current.value='';}
  }
  const [library, setLibrary] = useState<LocalLibrary | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manager, setManager] = useState(false);
  const [persisted, setPersisted] = useState(true);
  const [storageNotice, setStorageNotice] = useState("");
  const [pending, setPending] = useState<LocalLibrary | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  const mounted = useRef(true);
  const callback = useRef(onLibraryChange);
  callback.current = onLibraryChange;
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    loadLocalLibrary()
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          callback.current(saved);
          setLibrary(saved);
        }
      })
      .catch((e) => {
        if (!cancelled)
          setStorageNotice(
            e instanceof Error ? e.message : "개인 도감을 읽지 못했습니다.",
          );
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      worker.current?.terminate();
    };
  }, []);
  async function selectFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("JSON 파일은 25MB 이하여야 합니다.");
      setBusy(true);
      const text = await file.text();
      if (!mounted.current) return;
      type Response = ({ type: "success" } & Awaited<ReturnType<typeof convertLocalFile>>) | { type: "error"; message: string };
      let response: Response;
      try {
        response = await new Promise<Response>((resolve, reject) => {
          const converter = new Worker(
            new URL("./raw-import.worker.ts", import.meta.url),
            { type: "module" },
          );
          worker.current = converter;
          const timeout = setTimeout(() => {
            stop();
            reject(Error("변환 실행 응답 시간 초과"));
          }, 15000);
          function stop() {
            clearTimeout(timeout);
            converter.terminate();
            if (worker.current === converter) worker.current = null;
          }
          converter.onmessage = (event: MessageEvent<Response>) => {
            stop();
            resolve(event.data);
          };
          converter.onerror = (event) => {
            event.preventDefault();
            stop();
            reject(Error("변환 실행 파일을 불러오지 못했습니다."));
          };
          converter.onmessageerror = () => {
            stop();
            reject(Error("변환 응답을 읽지 못했습니다."));
          };
          try {
            converter.postMessage({ text, fileName: file.name });
          } catch (error) {
            stop();
            reject(error);
          }
        });
      } catch {
        if (!mounted.current) return;
        // Missing/stale worker assets or browser policy must not prevent local import.
        // No file bytes are fetched or uploaded by this fallback.
        response = { type: "success", ...await convertLocalFile(text, file.name) };
      }
      if (!mounted.current) return;
      if (response.type === "error") throw Error(response.message);
      const { digest, result } = response;
      setPending({
        version: 1,
        digest,
        fileName: file.name,
        importedAt: new Date().toISOString(),
        patchVersion: result.report.patchVersion,
        items: result.items,
        report: result.report,
      });
      setStorageNotice("");
      setManager(true);
    } catch (e) {
      if (mounted.current) {
        const message = e instanceof Error ? e.message : "파일을 읽지 못했습니다.";
        setStorageNotice(message);
        onMessage(message);
      }
    } finally {
      if (mounted.current) setBusy(false);
      if (picker.current) picker.current.value = "";
    }
  }
  async function apply() {
    if (!pending || !pending.items.length) return;
    setBusy(true);
    try {
      callback.current(pending);
      setLibrary(pending);
      setPersisted(false);
      try {
        await saveLocalLibrary(pending);
        setPersisted(true);
        setStorageNotice("");
        onMessage(
          "개인 도감을 이 브라우저에 저장했습니다. 파일은 전송되지 않았습니다.",
        );
      } catch (e) {
        setStorageNotice(
          "저장에 실패하여 이번 탭에서만 사용할 수 있습니다. 다시 열 때 원본 파일을 불러오세요.",
        );
        onMessage(
          e instanceof Error ? e.message : "개인 도감을 저장하지 못했습니다.",
        );
      }
      setPending(null);
      setManager(false);
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "개인 도감을 적용하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    setBusy(true);
    let cleared = false;
    try {
      await clearLocalLibrary();
      cleared = true;
    } catch {
      /* Session data must remain removable even when IndexedDB fails. */
    }
    try {
      callback.current(null);
      setLibrary(null);
      setPersisted(true);
      setManager(false);
      if (cleared) {
        setStorageNotice("");
        onMessage("개인 도감을 지웠습니다. 저장된 덱은 그대로 유지됩니다.");
      } else {
        const note =
          "현재 탭의 개인 도감은 지웠습니다. 브라우저에 남은 저장 사본은 지우지 못했으므로 다음에 다시 나타날 수 있습니다.";
        setStorageNotice(note);
        onMessage(note);
      }
    } finally {
      setBusy(false);
    }
  }
  function downloadReport() {
    const value = pending || library;
    if (!value) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value.report, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "bazaar-local-import-report.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const display = pending || library;
  const report = display?.report as RawImportReport | undefined;
  return (
    <>
      <div className="data-status" role="note">
        <Shield size={16} />
        <div>
          <strong>
            {library
              ? `개인 파일 아이템 ${library.items.length}개`
              : catalog.status === "ready"
                ? `${catalog.items.length}개 실제 아이템 · 패치 ${catalog.patchVersion}`
                : "실제 아이템 데이터 연결 대기"}
          </strong>
          <p>
            {busy
              ? "파일을 브라우저 안에서 처리하고 있습니다…"
              : library
                ? `${library.fileName} · ${persisted ? "이 브라우저에 보관됨" : "현재 탭에서만 사용"}`
                : catalog.status === "ready"
                  ? "출처와 패치가 기록된 데이터입니다."
                  : "허용 범위에서 보유한 원본 JSON을 선택하세요. 파일 내용은 서버로 전송되지 않습니다."}
          </p>
          {storageNotice && (
            <p className="local-storage-notice">{storageNotice}</p>
          )}
        </div>
        <div className="local-data-actions">
          <button
            disabled={!ready || busy}
            onClick={() => picker.current?.click()}
          >
            <ArrowUpFromLine size={14} /> 원본 JSON 불러오기
          </button>
          <button disabled={busy} onClick={() => setManager(true)}>
            <FileJson size={14} /> 개인 도감 관리
          </button>
        </div>
        <input
          hidden
          ref={picker}
          data-testid="raw-import"
          type="file"
          accept=".json,application/json"
          onChange={(e) => void selectFile(e.target.files?.[0])}
        />
      </div>
      {manager && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) {
              setManager(false);
              setPending(null);
            }
          }}
        >
          <section
            className="detail-modal local-catalog-modal"
            role="dialog"
            aria-modal="true"
            aria-label="개인 도감 관리"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="close"
              disabled={busy}
              aria-label="개인 도감 닫기"
              onClick={() => {
                setManager(false);
                setPending(null);
              }}
            >
              <X size={19} />
            </button>
            <div className="eyebrow">YOUR FILES · ON THIS DEVICE</div>
            <h2>{pending ? "가져오기 결과 확인" : "개인 도감"}</h2>
            <p>
              원본 JSON은 이 기기의 브라우저 안에서만 변환합니다. 선택한 파일의
              취득·이용 조건은 별도로 확인하세요. 파일 선택 자체가 이용 허가를
              뜻하지는 않습니다.
            </p>
            {report && display ? (
              <>
                <strong className="local-file-name">{display.fileName}</strong>
                <div className="import-summary">
                  <span>
                    전체 <b>{report.totalRecords}</b>
                  </span>
                  <span>
                    변환됨 <b>{report.importedCount}</b>
                  </span>
                  <span>
                    제외 <b>{report.excluded.length}</b>
                  </span>
                  <span>
                    격리 <b>{report.quarantined.length}</b>
                  </span>
                  <span>
                    미해석 <b>{report.unresolvedCount}</b>
                  </span>
                  <span>
                    활성 불확실 <b>{report.uncertainActivityCount}</b>
                  </span>
                </div>
                <p>
                  미해석 값은 임의로 채우지 않습니다. 활성 불확실 항목은
                  도감에서 표시하며, 현재 사용 가능한 게임 아이템임을 보증하지
                  않습니다. 패치는 파일명으로 추정하지 않습니다.
                </p>
                {report.warnings.length > 0 && (
                  <details>
                    <summary>변환 안내 ({report.warnings.length})</summary>
                    <ul>
                      {report.warnings.slice(0, 50).map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {[...report.excluded, ...report.quarantined].length > 0 && (
                  <details>
                    <summary>제외·격리 상세 (최대 50개 표시)</summary>
                    <ul>
                      {[...report.excluded, ...report.quarantined]
                        .slice(0, 50)
                        .map((issue, i) => (
                          <li key={i}>
                            <b>{issue.key}</b>:{" "}
                            {issueLabels[issue.reason] || issue.reason}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
                <button onClick={downloadReport}>
                  <ArrowDownToLine size={14} /> 변환 보고서 저장
                </button>
              </>
            ) : (
              <p>
                아직 개인 도감이 없습니다. 원본 JSON을 불러오면 결과를 확인한 뒤
                적용할 수 있습니다.
              </p>
            )}
            {pending && (
              <button
                className="primary full"
                disabled={busy || !pending.items.length}
                onClick={() => void apply()}
              >
                이 파일을 개인 도감으로 사용
              </button>
            )}
            {!pending && library && (
              <button
                className="danger full"
                disabled={busy}
                onClick={() => void clear()}
              >
                <Trash2 size={14} /> 개인 도감 지우기
              </button>
            )}
            <div className="future-images">
              <strong>이미지 파일 연결</strong>
              <p>먼저 Chronicle 변환 JSON을 적용한 뒤 items.zip을 선택하세요. UUID가 정확히 일치하는 WebP만 이 브라우저에 저장합니다. 분할 ZIP도 차례로 가져올 수 있습니다. 브라우저 데이터 삭제·저장 공간 회수 시 다시 가져와야 합니다.</p>
              <button disabled={busy || !library || !!pending} onClick={() => imagePicker.current?.click()}>개인 이미지 ZIP 불러오기</button>
              <input hidden ref={imagePicker} data-testid="image-import" type="file" accept=".zip,application/zip" onChange={e=>void selectImages(e.target.files?.[0])} />
              <p role="status">{imageProgress}</p>
              {imageReport && <button onClick={() => {
                const url=URL.createObjectURL(new Blob([JSON.stringify(imageReport,null,2)],{type:'application/json'}));
                const a=document.createElement('a');a.href=url;a.download='bazaar-image-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
              }}>이미지 매칭 보고서 저장</button>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
