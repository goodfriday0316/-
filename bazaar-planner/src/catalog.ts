import catalogJson from "./data/items.json";
export type TierKey = "bronze" | "silver" | "gold" | "diamond";
export type CatalogItem = {
  id: string;
  nameEn: string;
  nameKo: string | null;
  translationStatus: "official" | "untranslated";
  heroes: string[];
  size: 1 | 2 | 3;
  tags: string[];
  tiers: Partial<
    Record<
      TierKey,
      { effects: string[]; stats?: Record<string, string | number> }
    >
  >;
  image: {
    localId?: string | null;
    path: string | null;
    sourceUrl: string | null;
    status: "available" | "missing" | "unlicensed";
  };
  source: { url: string; patchVersion: string; id: string };
  local?: {
    metadataOnly?: boolean;
    chronicleIgnored?: boolean;
    activity: "uncertain" | "source-declared-active";
    warnings: string[];
    unresolvedByTier: Partial<Record<TierKey, string[]>>;
    abilityRefsByTier: Partial<
      Record<TierKey, { abilityIds: string[]; auraIds: string[] }>
    >;
    rawId: string | null;
    unsupportedTiers?: string[];
  };
};
export type Catalog = {
  schemaVersion: 1;
  version: string;
  patchVersion: string | null;
  status: "ready" | "blocked";
  generatedAt: string | null;
  source: {
    id: string;
    url: string;
    dataPermission: string;
    imagePermission: string;
  } | null;
  items: CatalogItem[];
};
export const catalog = catalogJson as Catalog;
export const heroIds = [
  "Vanessa",
  "Pygmalien",
  "Dooley",
  "Mak",
  "Stelle",
  "Jules",
  "Karnok",
  "Dragons",
  "Neutral",
];
export const heroNames = [
  "바네사",
  "피그말리엔",
  "둘리",
  "막",
  "스텔",
  "쥴스",
  "카르녹",
  "드래곤즈",
  "중립",
];
export const tierNames = ["브론즈", "실버", "골드", "다이아몬드"];
export const tierKeys: TierKey[] = ["bronze", "silver", "gold", "diamond"];
export type Item = CatalogItem & {
  name: string;
  icon: string;
  color: string;
  legacy?: boolean;
};
export function toItem(item: CatalogItem): Item {
  return {
    ...item,
    name: item.nameKo || item.nameEn,
    icon: "gem",
    color: "#89a68e",
  };
}
export const liveItems: Item[] = catalog.items.map(toItem);
export function matchesHero(item: Item, hero: string) {
  return item.heroes.includes(heroIds[heroNames.indexOf(hero)]);
}
