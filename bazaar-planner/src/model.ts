import legacyDataset from "./data/1.0.0-sample.json";
import {
  catalog,
  liveItems,
  heroNames,
  tierNames,
  tierKeys,
  type Item,
  type CatalogItem,
  toItem,
  type Catalog,
} from "./catalog";
export type { Item } from "./catalog";
export const heroes = heroNames;
export let data: Catalog = catalog;
export let items: Item[] = [...liveItems];
export function setLocalCatalog(
  localItems: CatalogItem[] | null,
  version?: string,
  patchVersion: string | null = null,
) {
  const next = localItems ? localItems.map(toItem) : [...liveItems];
  if (localItems && next.some((item) => !validSnapshot(item, item.id)))
    throw Error(
      "개인 도감의 저장 형식이 올바르지 않습니다. 기존 도감을 유지합니다.",
    );
  items = next;
  data = localItems
    ? {
        ...catalog,
        version: version || "local-session",
        patchVersion,
        status: "ready",
        source: null,
        items: localItems,
      }
    : catalog;
  registry.clear();
  for (const item of [...legacyItems, ...liveItems, ...items])
    registry.set(item.id, item);
}
export const tiers = tierNames;
export const enchants = ["없음", "화염", "얼음", "독", "빛", "가속"];
const legacyItems: Item[] = legacyDataset.items.map((i) => ({
  id: i.id,
  name: i.name,
  nameEn: i.name,
  nameKo: null,
  translationStatus: "untranslated",
  heroes: [],
  size: i.size as 1 | 2 | 3,
  tags: i.tags,
  tiers: {},
  image: { path: null, sourceUrl: null, status: "missing" },
  source: {
    url: "legacy:sample",
    patchVersion: legacyDataset.version,
    id: i.id,
  },
  icon: i.icon,
  color: i.color,
  legacy: true,
}));
const registry = new Map([...legacyItems, ...liveItems].map((i) => [i.id, i]));
export type Placed = {
  id: string;
  itemId: string;
  start: number;
  tier: string;
  enchant: string;
  snapshot?: Item;
};
export type Deck = { id: string; name: string; hero: string; items: Placed[] };
export type Save = {
  schemaVersion: 1;
  dataVersion: string;
  activeId: string;
  decks: Deck[];
};
export const uid = () => crypto.randomUUID();
export function getItem(id: string): Item {
  const item = registry.get(id);
  if (!item) throw Error(`아이템 ${id}의 원본 또는 저장 사본이 없습니다.`);
  return item;
}
export function getPlacedItem(p: Placed): Item {
  return p.snapshot ?? getItem(p.itemId);
}
export function effectFor(item: Item, tier: string) {
  return item.tiers[tierKeys[tiers.indexOf(tier)]];
}
export function availableTiers(item: Item) {
  return tiers.filter((_, i) => !!item.tiers[tierKeys[i]]);
}
export function canPlace(
  list: Placed[],
  itemId: string,
  start: number,
  ignore?: string,
) {
  const moving = list.find((p) => p.id === ignore);
  const item = moving ? getPlacedItem(moving) : registry.get(itemId);
  return (
    !!item &&
    Number.isInteger(start) &&
    start >= 0 &&
    start + item.size <= 10 &&
    !list.some(
      (p) =>
        p.id !== ignore &&
        start < p.start + getPlacedItem(p).size &&
        start + item.size > p.start,
    )
  );
}
function validSnapshot(s: unknown, id: string): s is Item {
  if (!s || typeof s !== "object") return false;
  const i = s as Item;
  return (
    i.id === id &&
    typeof i.name === "string" &&
    i.name.length <= 300 &&
    typeof i.nameEn === "string" &&
    (i.nameKo === null || typeof i.nameKo === "string") &&
    ["official", "untranslated"].includes(i.translationStatus) &&
    [1, 2, 3].includes(i.size) &&
    Array.isArray(i.heroes) &&
    i.heroes.every((h) => typeof h === "string") &&
    Array.isArray(i.tags) &&
    i.tags.length <= 100 &&
    i.tags.every((t) => typeof t === "string" && t.length <= 150) &&
    !!i.tiers &&
    typeof i.tiers === "object" &&
    Object.entries(i.tiers).every(
      ([k, t]) =>
        tierKeys.includes(k as (typeof tierKeys)[number]) &&
        !!t &&
        Array.isArray(t.effects) &&
        t.effects.every((e) => typeof e === "string" && e.length <= 10000) &&
        (!t.stats ||
          Object.entries(t.stats).every(
            ([key, value]) =>
              key.length <= 100 &&
              (typeof value === "string" ||
                (typeof value === "number" && Number.isFinite(value))),
          )),
    ) &&
    !!i.image &&
    (i.image.path === null ||
      (typeof i.image.path === "string" &&
        /^\/images\/items\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp)$/.test(
          i.image.path,
        ))) &&
    (!i.local ||
      (["uncertain", "source-declared-active"].includes(i.local.activity) &&
        (!i.local.unsupportedTiers ||
          (Array.isArray(i.local.unsupportedTiers) &&
            i.local.unsupportedTiers.length <= 5 &&
            i.local.unsupportedTiers.every(
              (t) => typeof t === "string" && t.length <= 100,
            ))) &&
        Array.isArray(i.local.warnings) &&
        i.local.warnings.length <= 100 &&
        i.local.warnings.every(
          (w) => typeof w === "string" && w.length <= 2000,
        ) &&
        !!i.local.unresolvedByTier &&
        Object.entries(i.local.unresolvedByTier).every(
          ([tier, tokens]) =>
            tierKeys.includes(tier as (typeof tierKeys)[number]) &&
            Array.isArray(tokens) &&
            tokens.length <= 200 &&
            tokens.every(
              (token) => typeof token === "string" && token.length <= 1000,
            ),
        ) &&
        !!i.local.abilityRefsByTier &&
        Object.entries(i.local.abilityRefsByTier).every(
          ([tier, refs]) =>
            tierKeys.includes(tier as (typeof tierKeys)[number]) &&
            !!refs &&
            Array.isArray(refs.abilityIds) &&
            Array.isArray(refs.auraIds) &&
            [...refs.abilityIds, ...refs.auraIds].every(
              (ref) => typeof ref === "string" && ref.length <= 300,
            ),
        ))) &&
    !!i.source &&
    typeof i.source.patchVersion === "string" &&
    typeof i.source.url === "string"
  );
}
export function validate(value: unknown): Save {
  const s = value as Save;
  if (
    !s ||
    s.schemaVersion !== 1 ||
    typeof s.dataVersion !== "string" ||
    !Array.isArray(s.decks) ||
    !s.decks.length ||
    s.decks.length > 50
  )
    throw Error("지원하지 않는 저장 형식입니다. 원본은 변경되지 않았습니다.");
  const deckIds = new Set<string>();
  const decks: Deck[] = [];
  for (const d of s.decks) {
    if (
      !d ||
      typeof d.id !== "string" ||
      deckIds.has(d.id) ||
      typeof d.name !== "string" ||
      d.name.length > 80 ||
      !heroes.includes(d.hero) ||
      !Array.isArray(d.items) ||
      d.items.length > 10
    )
      throw Error("덱 정보가 올바르지 않습니다.");
    deckIds.add(d.id);
    const seen: Placed[] = [];
    for (const p of d.items) {
      if (
        !p ||
        typeof p.id !== "string" ||
        typeof p.itemId !== "string" ||
        seen.some((x) => x.id === p.id) ||
        !tiers.includes(p.tier) ||
        !enchants.includes(p.enchant) ||
        !Number.isInteger(p.start)
      )
        throw Error("아이템 정보가 올바르지 않습니다.");
      if (p.snapshot && !validSnapshot(p.snapshot, p.itemId))
        throw Error("아이템 저장 사본이 올바르지 않습니다.");
      const known = registry.get(p.itemId);
      const item = p.snapshot ?? known;
      if (!item)
        throw Error(
          "현재 데이터에 없는 아이템입니다. 저장 사본이 포함된 JSON을 사용하세요.",
        );
      if (!p.snapshot && !item.legacy && s.dataVersion !== data.version)
        throw Error(
          "다른 패치의 아이템 저장 사본이 필요합니다. 원본은 유지됩니다.",
        );
      if (
        p.start < 0 ||
        p.start + item.size > 10 ||
        seen.some(
          (x) =>
            p.start < x.start + getPlacedItem(x).size &&
            p.start + item.size > x.start,
        )
      )
        throw Error("아이템이 겹치거나 보드 범위를 벗어납니다.");
      seen.push({ ...p, snapshot: structuredClone(item) });
    }
    decks.push({ ...d, items: seen });
  }
  if (!deckIds.has(s.activeId)) throw Error("선택된 덱을 찾을 수 없습니다.");
  return { ...s, decks };
}
export const initial = (): Save => {
  const id = uid();
  return {
    schemaVersion: 1,
    dataVersion: data.version,
    activeId: id,
    decks: [{ id, name: "바다의 부름", hero: "바네사", items: [] }],
  };
};
export const storageKey = "bazaar-planner-v1";
