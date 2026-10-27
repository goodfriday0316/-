import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  Anchor,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Compass,
  Copy,
  Flame,
  FlaskConical,
  Gem,
  Grid2X2,
  Leaf,
  Map,
  Plus,
  Search,
  Settings2,
  Shield,
  Ship,
  Sparkles,
  Star,
  Swords,
  Trash2,
  Undo2,
  X,
  Zap,
  CircleHelp,
  BookOpen,
  Columns2,
  Package,
  CircleDot,
  CookingPot,
  Shell,
} from "lucide-react";
import {
  data,
  items,
  heroes,
  tiers,
  enchants,
  getItem,
  getPlacedItem,
  availableTiers,
  effectFor,
  uid,
  canPlace,
  validate,
  initial,
  storageKey,
  setLocalCatalog,
  type Item,
  type Placed,
  type Save,
  type Deck,
} from "./model";
import { matchesHero, tierKeys } from "./catalog";
import { LocalCatalogPanel } from "./LocalCatalogPanel";
import type { LocalLibrary } from "./local-library";
import "./style.css";
const icons: Record<string, typeof Anchor> = {
  sword: Swords,
  compass: Compass,
  cannon: Ship,
  anchor: Anchor,
  shell: Shell,
  flask: FlaskConical,
  wheel: CircleDot,
  map: Map,
  chest: Package,
  core: Zap,
  leaf: Leaf,
  star: Star,
  pan: CookingPot,
  flame: Flame,
  gem: Gem,
};
function Art({ item }: { item: Item }) {
  const Icon = icons[item.icon] || Gem;
  const [failedPath, setFailedPath] = useState<string | null>(null);
  if (item.image.path && failedPath !== item.image.path)
    return (
      <div className="art actual-art">
        <img
          draggable={false}
          loading="lazy"
          src={item.image.path}
          alt={item.name}
          onError={() => setFailedPath(item.image.path)}
        />
      </div>
    );
  return (
    <div
      className="art"
      style={{ "--item-color": item.color } as React.CSSProperties}
    >
      <div className="art-ring" />
      <Icon strokeWidth={1.05} />
      <span className="art-spark">✦</span>
    </div>
  );
}
function Card({
  item,
  placed,
  onSelect,
}: {
  item: Item;
  placed?: Placed;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: placed ? `placed:${placed.id}` : `catalog:${item.id}`,
    data: { itemId: item.id, placedId: placed?.id, item },
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`item-card ${placed ? "on-board" : ""} ${isDragging ? "dragging" : ""}`}
      style={{
        opacity: isDragging ? 0.3 : 1,
      }}
      aria-label={`${item.name}${placed ? " 보드 아이템" : ""}`}
    >
      <div className="card-top">
        <span>{placed?.tier || availableTiers(item)[0] || "기존 샘플"}</span>
        <span>{"▮".repeat(item.size)}</span>
      </div>
      <Art item={item} />
      <strong>{item.name}</strong>
      {item.legacy ? (
        <span className="item-notice">기존 샘플</span>
      ) : item.translationStatus === "untranslated" ? (
        <span className="item-notice">미번역</span>
      ) : null}
      {item.local && (
        <span className="item-notice">
          {item.local.activity === "uncertain"
            ? "활성 불확실"
            : "파일의 활성 표시"}
          {Object.values(item.local.unresolvedByTier).some(
            (tokens) => tokens?.length,
          )
            ? " · 미해석"
            : ""}
        </span>
      )}
      <span className="item-tags">{item.tags.join(" · ")}</span>
      {placed && placed.enchant !== "없음" && (
        <span className="enchant-label">✦ {placed.enchant}</span>
      )}
    </button>
  );
}
function Slot({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${index}` });
  return (
    <div
      ref={setNodeRef}
      data-testid={`slot-${index}`}
      className={`slot ${isOver ? "over" : ""}`}
    >
      <span>{String(index + 1).padStart(2, "0")}</span>
      <Plus size={15} />
    </div>
  );
}
function Trash() {
  const { setNodeRef, isOver } = useDroppable({ id: "trash" });
  return (
    <div ref={setNodeRef} className={`trash-target ${isOver ? "over" : ""}`}>
      <Trash2 size={15} /> 제거하려면 여기로 드래그
    </div>
  );
}
function MiniBoard({ deck }: { deck: Deck }) {
  return (
    <div className="mini-board">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="mini-slot" />
      ))}
      {deck.items.map((p) => (
        <div
          key={p.id}
          className="mini-item"
          style={{
            gridColumn: `${p.start + 1} / span ${getPlacedItem(p).size}`,
          }}
        >
          <Art item={getPlacedItem(p)} />
          <span>{getPlacedItem(p).name}</span>
        </div>
      ))}
    </div>
  );
}
function loadSavedDecks() {
  try {
    const raw = localStorage.getItem(storageKey);
    const state = raw ? validate(JSON.parse(raw)) : initial();
    return {
      state,
      failed: false,
      migrationRaw: raw && JSON.stringify(state) !== raw ? raw : null,
    };
  } catch {
    return { state: initial(), failed: true, migrationRaw: null };
  }
}
function App() {
  const [loaded] = useState(loadSavedDecks);
  const [, setCatalogRevision] = useState(0);
  function onLocalLibrary(library: LocalLibrary | null) {
    setLocalCatalog(
      library?.items ?? null,
      library ? `local:${library.digest}` : undefined,
      library?.patchVersion ?? null,
    );
    setCatalogRevision((n) => n + 1);
    setSelection(null);
  }
  const [state, setState] = useState<Save>(loaded.state);
  const [saveBlocked, setSaveBlocked] = useState(loaded.failed);
  const recoveryWritten = useRef(false);
  const migrationWritten = useRef(false);
  const [query, setQuery] = useState("");
  const [size, setSize] = useState(0);
  const [selection, setSelection] = useState<{
    itemId: string;
    placedId?: string;
  } | null>(null);
  const [drag, setDrag] = useState<Item | null>(null);
  const [message, setMessage] = useState(
    loaded.failed
      ? "저장 데이터를 읽지 못했습니다. 원본은 유지되며, 편집 시 복구 사본을 보존합니다."
      : "",
  );
  const [saveError, setSaveError] = useState(false);
  const [compare, setCompare] = useState(false);
  const [help, setHelp] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const deck = state.decks.find((d) => d.id === state.activeId)!;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  useEffect(() => {
    if (loaded.failed && state === loaded.state) return;
    try {
      if (loaded.migrationRaw && !migrationWritten.current) {
        localStorage.setItem(
          `${storageKey}-before-catalog-update`,
          loaded.migrationRaw,
        );
        migrationWritten.current = true;
      }
      if (loaded.failed && !recoveryWritten.current) {
        const raw = localStorage.getItem(storageKey);
        if (raw) localStorage.setItem(`${storageKey}-recovery`, raw);
        recoveryWritten.current = true;
      }
      localStorage.setItem(storageKey, JSON.stringify(state));
      setSaveError(false);
      setSaveBlocked(false);
    } catch {
      setSaveError(true);
    }
  }, [state, loaded]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  function update(fn: (d: Deck) => Deck) {
    setState((s) => ({
      ...s,
      dataVersion: data.version,
      decks: s.decks.map((d) => (d.id === s.activeId ? fn(d) : d)),
    }));
  }
  function add(
    itemId: string,
    start?: number,
    placedId?: string,
    tier?: string,
  ) {
    const spot =
      start ??
      Array.from({ length: 10 }, (_, i) => i).find((i) =>
        canPlace(deck.items, itemId, i),
      );
    if (spot === undefined || !canPlace(deck.items, itemId, spot, placedId)) {
      setMessage(
        "이 위치에는 놓을 수 없습니다. 빈 공간과 아이템 크기를 확인하세요.",
      );
      return;
    }
    update((d) => ({
      ...d,
      items: placedId
        ? d.items.map((p) => (p.id === placedId ? { ...p, start: spot } : p))
        : [
            ...d.items,
            {
              id: uid(),
              itemId,
              start: spot,
              tier: tier || availableTiers(getItem(itemId))[0] || "브론즈",
              enchant: "없음",
              snapshot: structuredClone(getItem(itemId)),
            },
          ],
    }));
  }
  function remove(id: string) {
    update((d) => ({ ...d, items: d.items.filter((p) => p.id !== id) }));
    setSelection(null);
  }
  function end(e: DragEndEvent) {
    setDrag(null);
    if (!e.over) return;
    const { itemId, placedId } = e.active.data.current as {
      itemId: string;
      placedId?: string;
    };
    if (e.over.id === "trash") {
      if (placedId) remove(placedId);
      return;
    }
    if (String(e.over.id).startsWith("slot:"))
      add(itemId, Number(String(e.over.id).split(":")[1]), placedId);
  }
  function newDeck(copy = false) {
    if (state.decks.length >= 50) {
      setMessage("덱은 최대 50개까지 저장할 수 있습니다.");
      return;
    }
    const d: Deck = {
      id: uid(),
      name: copy
        ? `${deck.name.slice(0, 70)} 복사`
        : `새로운 항해 ${state.decks.length + 1}`,
      hero: deck.hero,
      items: copy ? deck.items.map((p) => ({ ...p, id: uid() })) : [],
    };
    setState((s) => ({
      ...s,
      dataVersion: data.version,
      activeId: d.id,
      decks: [...s.decks, d],
    }));
    setSelection(null);
  }
  function exportJson() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "bazaar-decks.json";
    a.click();
    URL.revokeObjectURL(url);
    setMessage("모든 덱을 JSON으로 내보냈습니다.");
  }
  async function importJson(f?: File) {
    if (!f) return;
    try {
      if (f.size > 2_000_000) throw Error("파일은 2MB 이하여야 합니다.");
      const s = validate(JSON.parse(await f.text()));
      setState(structuredClone(s));
      setSelection(null);
      setMessage("덱을 성공적으로 불러왔습니다.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "파일을 읽을 수 없습니다.");
    }
    if (file.current) file.current.value = "";
  }
  const filtered = items.filter(
    (i) =>
      matchesHero(i, deck.hero) &&
      (!size || i.size === size) &&
      `${i.name} ${i.nameEn} ${i.nameKo || ""} ${i.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const used = deck.items.reduce((n, p) => n + getPlacedItem(p).size, 0);
  const placed = deck.items.find((p) => p.id === selection?.placedId);
  const selected = placed
    ? getPlacedItem(placed)
    : selection
      ? getItem(selection.itemId)
      : null;
  const [previewTier, setPreviewTier] = useState("브론즈");
  const selectedTier =
    placed?.tier ||
    (selected && availableTiers(selected).includes(previewTier)
      ? previewTier
      : selected
        ? availableTiers(selected)[0]
        : undefined);
  const effect =
    selected && selectedTier ? effectFor(selected, selectedTier) : undefined;
  return (
    <>
      <header>
        <a className="brand" href="./">
          <span className="brand-mark">
            <Gem size={24} />
          </span>
          <span>
            THE BAZAAR<small>DECK ATELIER</small>
          </span>
        </a>
        <nav>
          <span className="nav-active">
            <Grid2X2 size={15} /> 덱 플래너
          </span>
          <button onClick={() => setHelp(true)}>
            <BookOpen size={15} /> 사용 가이드
          </button>
        </nav>
        <div className={`save-state ${saveError ? "error" : ""}`}>
          <span />
          {saveError
            ? "자동 저장 실패"
            : saveBlocked
              ? "원본 보존 중 · 편집 전 저장 보류"
              : "브라우저에 자동 저장됨"}
        </div>
        <span className="version">
          {data.version.startsWith("local:")
            ? "LOCAL FILE"
            : data.patchVersion
              ? `PATCH ${data.patchVersion}`
              : "DATA PENDING"}
        </span>
      </header>
      <div className="page-title">
        <div>
          <div className="eyebrow">YOUR NEXT GREAT BUILD</div>
          <h1>
            다음 승리를 설계하세요<span>.</span>
          </h1>
          <p>아이템을 모으고, 배치를 다듬고, 나만의 덱을 완성하세요.</p>
        </div>
        <div className="file-actions">
          <button onClick={() => file.current?.click()}>
            <ArrowUpFromLine size={15} /> 가져오기
          </button>
          <button onClick={exportJson}>
            <ArrowDownToLine size={15} /> JSON 내보내기
          </button>
          <input
            hidden
            type="file"
            accept=".json,application/json"
            ref={file}
            data-testid="deck-import"
            onChange={(e) => importJson(e.target.files?.[0])}
          />
        </div>
      </div>
      <LocalCatalogPanel
        onLibraryChange={onLocalLibrary}
        onMessage={setMessage}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={(args) =>
          args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args)
        }
        onDragStart={(e) => setDrag(e.active.data.current?.item)}
        onDragCancel={() => setDrag(null)}
        onDragEnd={end}
      >
        <main>
          <aside className="catalog">
            <div className="panel-heading">
              <span>
                <Package size={17} /> 아이템 도감
              </span>
              <span className="muted">
                {items.filter((i) => matchesHero(i, deck.hero)).length} ITEMS
              </span>
            </div>
            <div className="hero-picker">
              <label>영웅 선택</label>
              <div className="hero-select">
                <span className="hero-avatar">
                  <Anchor size={24} />
                </span>
                <select
                  aria-label="영웅 선택"
                  value={deck.hero}
                  onChange={(e) => {
                    update((d) => ({ ...d, hero: e.target.value }));
                    setSelection(null);
                  }}
                >
                  {heroes.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </div>
            </div>
            <div className="search">
              <Search size={17} />
              <input
                aria-label="아이템 검색"
                placeholder="이름 또는 태그로 검색..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button aria-label="검색 지우기" onClick={() => setQuery("")}>
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="filters">
              {["전체", "소형", "중형", "대형"].map((n, i) => (
                <button
                  key={n}
                  className={size === i ? "active" : ""}
                  onClick={() => setSize(i)}
                >
                  {n}
                  {i > 0 && <span>{"▮".repeat(i)}</span>}
                </button>
              ))}
            </div>
            <div className="catalog-meta">
              <span>{filtered.length}개의 아이템</span>
              <span>
                이름순 <ChevronDown size={11} />
              </span>
            </div>
            <div className="item-grid">
              {[...filtered]
                .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                .map((i) => (
                  <Card
                    key={i.id}
                    item={i}
                    onSelect={() => setSelection({ itemId: i.id })}
                  />
                ))}
            </div>
            {!filtered.length && (
              <div className="empty-search">
                {data.status === "ready"
                  ? "검색 결과가 없습니다."
                  : "사용 가능한 실제 데이터가 없습니다."}
                <br />
                <button
                  onClick={() => {
                    setQuery("");
                    setSize(0);
                  }}
                >
                  필터 초기화
                </button>
              </div>
            )}
            <div className="catalog-foot">
              <CircleHelp size={14} /> 클릭하여 추가 · 터치로 길게 눌러 드래그
            </div>
          </aside>
          <section className="workspace">
            <div className="deck-bar">
              <div className="deck-tabs">
                {state.decks.map((d, i) => (
                  <button
                    key={d.id}
                    className={d.id === deck.id ? "active" : ""}
                    onClick={() => {
                      setState((s) => ({ ...s, activeId: d.id }));
                      setSelection(null);
                    }}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {d.name}
                  </button>
                ))}
                <button
                  className="new-deck"
                  aria-label="새 덱"
                  onClick={() => newDeck()}
                >
                  <Plus size={16} />
                </button>
              </div>
              <button
                className={`compare-button ${compare ? "active" : ""}`}
                onClick={() => setCompare(!compare)}
              >
                <Columns2 size={15} /> 덱 비교
              </button>
            </div>
            <div className="deck-content">
              <div className="deck-heading">
                <div>
                  <div className="eyebrow">
                    BUILD{" "}
                    {String(
                      state.decks.findIndex((d) => d.id === deck.id) + 1,
                    ).padStart(2, "0")}{" "}
                    <span> / {deck.hero}</span>
                  </div>
                  <input
                    className="deck-name"
                    aria-label="덱 이름"
                    maxLength={80}
                    value={deck.name}
                    onChange={(e) =>
                      update((d) => ({ ...d, name: e.target.value }))
                    }
                  />
                </div>
                <div className="deck-tools">
                  <button
                    title="덱 복제"
                    aria-label="덱 복제"
                    onClick={() => newDeck(true)}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    title="덱 삭제"
                    aria-label="덱 삭제"
                    disabled={state.decks.length === 1}
                    onClick={() => {
                      setState((s) => {
                        const decks = s.decks.filter((d) => d.id !== deck.id);
                        return { ...s, decks, activeId: decks[0].id };
                      });
                      setSelection(null);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="board-label">
                <span>
                  <Grid2X2 size={14} /> 전장 보드
                </span>
                <span>
                  <b>{used}</b> / 10 칸 사용 <i />
                </span>
              </div>
              <div className="board-scroll">
                <div className="board">
                  <div className="slots">
                    {Array.from({ length: 10 }, (_, i) => (
                      <Slot key={i} index={i} />
                    ))}
                  </div>
                  <div className="placed-layer">
                    {deck.items.map((p) => (
                      <div
                        key={p.id}
                        className="placed-wrap"
                        style={{
                          gridColumn: `${p.start + 1} / span ${getPlacedItem(p).size}`,
                        }}
                      >
                        <Card
                          item={getPlacedItem(p)}
                          placed={p}
                          onSelect={() =>
                            setSelection({ itemId: p.itemId, placedId: p.id })
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {!deck.items.length && (
                    <div className="board-empty">
                      <span>
                        <Plus size={22} />
                      </span>
                      <strong>가능성은 빈 보드에서 시작됩니다</strong>
                      <p>왼쪽의 아이템을 원하는 칸으로 드래그하세요</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="board-bottom">
                <span>
                  <i className="dot" /> 소형 1칸 <i className="dot medium" />{" "}
                  중형 2칸 <i className="dot large" /> 대형 3칸
                </span>
                <Trash />
              </div>
              <div className="overview">
                <div className="section-heading">
                  <h2>덱 개요</h2>
                  <span>BUILD OVERVIEW</span>
                </div>
                <div className="stats">
                  <div>
                    <Package />
                    <small>아이템</small>
                    <strong>
                      {deck.items.length}
                      <span>개</span>
                    </strong>
                  </div>
                  <div>
                    <Grid2X2 />
                    <small>남은 공간</small>
                    <strong>
                      {10 - used}
                      <span>칸</span>
                    </strong>
                  </div>
                  <div>
                    <Sparkles />
                    <small>마법부여</small>
                    <strong>
                      {deck.items.filter((p) => p.enchant !== "없음").length}
                      <span>개</span>
                    </strong>
                  </div>
                </div>
                <div className="tags-summary">
                  <span>덱 태그</span>
                  {[
                    ...new Set(
                      deck.items.flatMap((p) => getPlacedItem(p).tags),
                    ),
                  ].map((t) => (
                    <b key={t}>{t}</b>
                  ))}
                  {!deck.items.length && (
                    <em>아이템을 추가하면 덱의 태그가 표시됩니다.</em>
                  )}
                </div>
              </div>
              {compare && (
                <div className="comparison">
                  <div className="section-heading">
                    <h2>덱 비교</h2>
                    <button
                      aria-label="비교 닫기"
                      onClick={() => setCompare(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {state.decks.length < 2 && (
                    <p>덱을 새로 만들거나 복제하여 나란히 비교하세요.</p>
                  )}
                  <div className="comparison-grid">
                    {state.decks.map((d) => (
                      <div className="compare-card" key={d.id}>
                        <strong>{d.name}</strong>
                        <span>
                          {d.hero} · {d.items.length}개 ·{" "}
                          {d.items.reduce(
                            (n, p) => n + getPlacedItem(p).size,
                            0,
                          )}
                          /10칸
                        </span>
                        <MiniBoard deck={d} />
                        <small>
                          {d.items
                            .map(
                              (p) =>
                                `${getPlacedItem(p).name} (${p.tier} / ${p.enchant})`,
                            )
                            .join(" · ") || "빈 덱"}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="note">
                <span className="note-icon">
                  <Compass size={23} />
                </span>
                <div>
                  <strong>완벽한 배치에는 정답이 없으니까.</strong>
                  <p>덱을 복제해 다른 조합을 실험하고, 나란히 비교해 보세요.</p>
                </div>
                <button onClick={() => newDeck(true)}>
                  이 덱 복제하기 <Copy size={14} />
                </button>
              </div>
            </div>
            <footer>
              <span>
                <Shield size={13} /> 비공식 팬 메이드 플래너
              </span>
              <span>
                {data.status === "ready"
                  ? data.version.startsWith("local:")
                    ? "개인 파일 · 패치 미확인"
                    : `데이터 패치 ${data.patchVersion || "미확인"}`
                  : "실제 데이터 미연결 · 기존 덱 보존"}
              </span>
            </footer>
          </section>
        </main>
        <DragOverlay dropAnimation={null}>
          {drag && (
            <div className="drag-preview">
              <Art item={drag} />
              <strong>{drag.name}</strong>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <div className="bottom-note">
        <span>THE BAZAAR / DECK ATELIER</span>
        <span>계획은 자유롭게. 가능성은 무한하게.</span>
        <span>
          DATA {data.version.startsWith("local:") ? "LOCAL FILE" : data.version}
        </span>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelection(null)}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="아이템 툴팁"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="close"
              aria-label="툴팁 닫기"
              onClick={() => setSelection(null)}
            >
              <X size={19} />
            </button>
            <div className="eyebrow">
              {selected.legacy
                ? "LEGACY SAMPLE"
                : selected.translationStatus === "untranslated"
                  ? "UNTRANSLATED"
                  : "ITEM"}{" "}
              / {selected.source.patchVersion}
            </div>
            <Art item={selected} />
            <h2>{selected.name}</h2>
            <div className="detail-tags">
              {selected.tags.join(" · ")} · {selected.size}칸
            </div>
            <div className="item-effects">
              {effect ? (
                <>
                  <strong>{selectedTier} 효과</strong>
                  {effect.effects.map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                  {effect.stats && (
                    <dl>
                      {Object.entries(effect.stats).map(([key, value]) => (
                        <React.Fragment key={key}>
                          <dt>{key}</dt>
                          <dd>{value}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                </>
              ) : (
                <p>
                  {selected.legacy
                    ? "기존 샘플 아이템입니다. 실제 게임의 이름·효과·수치로 사용하지 않습니다."
                    : "이 등급의 효과 정보는 확인되지 않았습니다."}
                </p>
              )}
            </div>
            {!placed && !selected.legacy && (
              <label>
                아이템 등급
                <select
                  aria-label="효과 미리보기 등급"
                  value={selectedTier}
                  onChange={(e) => setPreviewTier(e.target.value)}
                >
                  {availableTiers(selected).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            {selected.nameEn !== selected.name && (
              <p className="english-name">{selected.nameEn}</p>
            )}
            {!selected.legacy && selected.source.url.startsWith("https://") && (
              <a
                className="source-link"
                href={selected.source.url}
                target="_blank"
                rel="noreferrer"
              >
                데이터 출처 ↗
              </a>
            )}
            {selected.local && (
              <div className="local-item-info">
                <strong>
                  {selected.local.activity === "uncertain"
                    ? "활성 여부 불확실"
                    : "파일에 활성으로 표시됨 · 별도 검증 안 됨"}
                </strong>
                <p>
                  개인 파일에서 변환한 항목입니다. 패치와 현재 게임에서의 사용
                  가능 여부는 확인되지 않았습니다.
                </p>
                <details>
                  <summary>능력 참조·미해석·변환 안내</summary>
                  <p>
                    미해석:{" "}
                    {(
                      selected.local.unresolvedByTier[
                        tierKeys[tiers.indexOf(selectedTier || "")]
                      ] || []
                    ).join(", ") ||
                      "자리표시자 미해석 없음 (효과 전체 검증을 뜻하지 않음)"}
                  </p>
                  <p>
                    능력 ID:{" "}
                    {(
                      selected.local.abilityRefsByTier[
                        tierKeys[tiers.indexOf(selectedTier || "")]
                      ]?.abilityIds || []
                    ).join(", ") || "없음/미지정"}
                  </p>
                  <p>
                    지속 효과 ID:{" "}
                    {(
                      selected.local.abilityRefsByTier[
                        tierKeys[tiers.indexOf(selectedTier || "")]
                      ]?.auraIds || []
                    ).join(", ") || "없음/미지정"}
                  </p>
                  <ul>
                    {selected.local.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
            <small className="muted">
              {selected.legacy
                ? "이전 버전 덱 호환용으로만 보존됩니다."
                : `기준 패치 ${selected.source.patchVersion} · ${selected.translationStatus === "official" ? "공식 한국어 명칭" : "미번역 · 영어 원문 유지"}`}
            </small>
            {placed ? (
              <>
                <label>
                  아이템 등급
                  <select
                    aria-label="아이템 등급"
                    value={placed.tier}
                    onChange={(e) =>
                      update((d) => ({
                        ...d,
                        items: d.items.map((p) =>
                          p.id === placed.id
                            ? { ...p, tier: e.target.value }
                            : p,
                        ),
                      }))
                    }
                  >
                    {(selected.legacy
                      ? tiers
                      : [
                          ...new Set([
                            ...availableTiers(selected),
                            ...(placed ? [placed.tier] : []),
                          ]),
                        ]
                    ).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  마법부여 (덱 메모)
                  <select
                    aria-label="마법부여"
                    value={placed.enchant}
                    onChange={(e) =>
                      update((d) => ({
                        ...d,
                        items: d.items.map((p) =>
                          p.id === placed.id
                            ? { ...p, enchant: e.target.value }
                            : p,
                        ),
                      }))
                    }
                  >
                    {enchants.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <small className="muted">
                  마법부여는 덱 메모이며 효과 수치를 계산하지 않습니다.
                </small>
                <button
                  className="danger full"
                  onClick={() => remove(placed.id)}
                >
                  <Trash2 size={15} /> 보드에서 제거
                </button>
              </>
            ) : (
              <button
                className="primary full"
                onClick={() => {
                  add(selected.id, undefined, undefined, selectedTier);
                  setSelection(null);
                }}
              >
                <Plus size={16} /> 빈 공간에 추가
              </button>
            )}
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="detail-modal help"
            role="dialog"
            aria-modal="true"
            aria-label="사용 가이드"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="close"
              aria-label="가이드 닫기"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <div className="eyebrow">A LITTLE FIELD GUIDE</div>
            <h2>당신의 다음 항해를 위해</h2>
            <p>1. 영웅을 고르고 이름이나 태그로 아이템을 찾으세요.</p>
            <p>
              2. 아이템을 10칸 보드에 드래그하세요. 휴대폰에서는 0.25초 이상
              길게 누른 후 이동하세요. 클릭 후 추가도 가능합니다. 보드의
              아이템을 클릭하면 등급·마법부여를 변경하거나 제거할 수 있습니다.
            </p>
            <p>
              3. 보드 아이템을 빈 칸으로 드래그해 이동하세요. 겹침과 범위 초과는
              허용되지 않습니다.
            </p>
            <p>
              4. + 버튼으로 덱을 만들고, 복제 및 덱 비교로 조합을 살펴보세요.
            </p>
            <p>
              5. 변경은 이 브라우저에 자동 저장됩니다. JSON 내보내기로
              백업하세요. 가져오기는 저장된 전체 덱을 교체합니다.
            </p>
            <small>
              공식 데이터 및 이미지는 포함하지 않습니다. 전투 시뮬레이션은
              지원하지 않습니다.
            </small>
          </section>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <CircleHelp size={17} />
          {message}
          <button aria-label="알림 닫기" onClick={() => setMessage("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
