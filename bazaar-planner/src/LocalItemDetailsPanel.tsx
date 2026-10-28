import { useEffect, useRef, useState } from 'react';
import { FileJson, X, Upload, Trash2 } from 'lucide-react';
import type { CatalogItem } from './catalog';
import { loadItemDetails, parseItemDetails, saveItemDetails, setItemDetails, type ItemDetailsImport } from './item-details';

type Props = { items: readonly CatalogItem[]; onChange: () => void; onMessage: (message: string) => void };
export function LocalItemDetailsPanel({items,onChange,onMessage}: Props) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[current,setCurrent]=useState<ItemDetailsImport|null>(null),[pending,setPending]=useState<ItemDetailsImport|null>(null),[notice,setNotice]=useState('');
  const picker=useRef<HTMLInputElement>(null),callback=useRef(onChange);callback.current=onChange;
  useEffect(()=>{
    let cancelled=false;
    setPending(null);
    if(!items.length) {setItemDetails(null);setCurrent(null);callback.current();return;}
    loadItemDetails().then(value=>{
      if(cancelled) return;
      const result=value?parseItemDetails(value,items):null;
      setItemDetails(result?.file??null);setCurrent(result);callback.current();
    }).catch(error=>{if(!cancelled)setNotice(error instanceof Error?error.message:'이름·링크 파일을 읽지 못했습니다.');});
    return()=>{cancelled=true;};
  },[items]);
  async function select(file?:File) {
    if(!file)return;setBusy(true);
    try {
      if(file.size>5*1024*1024)throw Error('이름·링크 JSON은 5MB 이하여야 합니다.');
      let value:unknown;
      try{value=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{throw Error('이름·링크 JSON 형식이 올바르지 않습니다.');}
      setPending(parseItemDetails(value,items));setNotice('');setOpen(true);
    }catch(error){setNotice(error instanceof Error?error.message:'파일을 읽지 못했습니다.');}
    finally{setBusy(false);if(picker.current)picker.current.value='';}
  }
  async function apply() {
    if(!pending?.file.records.length)return;setBusy(true);
    try{await saveItemDetails(pending.file);setItemDetails(pending.file);setCurrent(pending);setPending(null);callback.current();setNotice('이 브라우저에 이름·링크 매핑을 저장했습니다.');onMessage('이름·링크 매핑을 적용했습니다.');}
    catch(error){setNotice(error instanceof Error?error.message:'저장하지 못했습니다.');}
    finally{setBusy(false);}
  }
  async function clear() {
    setBusy(true);
    try{await saveItemDetails(null);setItemDetails(null);setCurrent(null);setPending(null);callback.current();setNotice('매핑을 지웠습니다. 덱과 이미지는 유지됩니다.');}
    catch(error){setNotice(error instanceof Error?error.message:'지우지 못했습니다.');}
    finally{setBusy(false);}
  }
  const report=(pending||current)?.report;
  return <>
    <button onClick={()=>setOpen(true)} aria-label="한국어 이름·외부 링크 관리"><FileJson size={14}/> 한국어 이름·외부 링크</button>
    {open&&<div className="modal-backdrop" onClick={()=>{if(!busy){setOpen(false);setPending(null);}}}>
      <section className="detail-modal local-catalog-modal" role="dialog" aria-modal="true" aria-label="한국어 이름·외부 링크 관리" onClick={e=>e.stopPropagation()}>
        <button className="close" disabled={busy} aria-label="이름·링크 관리 닫기" onClick={()=>{setOpen(false);setPending(null);}}><X size={19}/></button>
        <h2>한국어 이름·외부 링크</h2>
        <p>공식 한국어 파일에서 추출한 매핑만 가져오세요. 외부 링크는 같은 영어 이름의 개별 상세 페이지를 직접 확인한 기록이 필요합니다. 파일은 서버로 전송되지 않습니다.</p>
        <p>앱은 출처 기록과 ID·이름 일치를 검사하며, 파일이 공식 원본인지 또는 외부 페이지 내용이 바뀌었는지를 온라인으로 검증하지 않습니다.</p>
        <button disabled={busy||!items.length} onClick={()=>picker.current?.click()}><Upload size={14}/> 이름·링크 JSON 불러오기</button>
        {!items.length&&<p>먼저 아이템 도감을 불러오세요.</p>}
        <input hidden ref={picker} type="file" accept=".json,application/json" data-testid="item-details-import" onChange={e=>void select(e.target.files?.[0])}/>
        {report?<div className="import-summary"><span>한국어 이름 <b>{report.koreanMatched}</b></span><span>한국어 미확인 <b>{report.koreanUnconfirmed}</b></span><span>상세 링크 <b>{report.linksMatched}</b></span><span>연결 없음 <b>{report.linksUnmatched}</b></span><span>제외 <b>{report.issues.length}</b></span></div>:<p>한국어 이름 0개 · 상세 링크 0개 · 전체 {items.length}개</p>}
        {report?.issues.length? <details><summary>가져오기 결과 ({report.issues.length}개 제외)</summary><ul>{report.issues.slice(0,50).map((i,n)=><li key={n}>{i.templateId||'항목'}: {i.reason}</li>)}</ul></details>:null}
        {pending&&<button className="primary full" disabled={busy||!pending.file.records.length} onClick={()=>void apply()}>이 이름·링크 매핑 적용</button>}
        {current&&!pending&&<button className="danger full" disabled={busy} onClick={()=>void clear()}><Trash2 size={14}/> 이름·링크 매핑 지우기</button>}
        {notice&&<p role="status">{notice}</p>}
      </section>
    </div>}
  </>;
}
