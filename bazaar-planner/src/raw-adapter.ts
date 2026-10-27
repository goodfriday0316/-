/** Browser-only structural adapter. No network, persistence, game data or asset lookup. */
import type { CatalogItem, TierKey } from "./catalog.ts";

type Row = Record<string, unknown>;
const HEROES = new Set([
  "Vanessa",
  "Pygmalien",
  "Dooley",
  "Mak",
  "Stelle",
  "Jules",
  "Karnok",
  "Dragons",
  "Neutral",
]);
const ORDER = ["Bronze", "Silver", "Gold", "Diamond"] as const;
const SIZES: Record<string, 1 | 2 | 3> = { Small: 1, Medium: 2, Large: 3 };
const own = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);
const row = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 10000): value is string =>
  typeof value === "string" && value.length <= max;
const stableId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,249}$/.test(value);
const dedupe = <T>(values: T[]): T[] => [...new Set(values)];
class InvalidRecord extends Error {}
const invalid = (reason: string): never => {
  throw new InvalidRecord(reason);
};
export type RawImportIssue = { key: string; id?: string; reason: string };
export type RawImportReport = {
  totalRecords: number;
  importedCount: number;
  excluded: RawImportIssue[];
  quarantined: RawImportIssue[];
  unresolvedCount: number;
  warnings: string[];
  fileName: string | null;
  sha256: string | null;
  patchVersion: string | null;
  uncertainActivityCount: number;
};
export type RawImportOptions = {
  fileName?: string;
  sha256?: string;
  patchVersion?: string;
};

function canonical(value: unknown, depth = 0): string {
  if (depth > 35) return invalid("structure-too-deep");
  if (Array.isArray(value))
    return `[${value.map((v) => canonical(v, depth + 1)).join(",")}]`;
  if (row(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k], depth + 1)}`)
      .join(",")}}`;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return JSON.stringify(value);
  return invalid("non-json-value");
}
function sourceId(record: Row): string {
  const source = record.source_id;
  const id = record.id;
  if (
    (source !== undefined && !stableId(source)) ||
    (id !== undefined && !stableId(id))
  )
    return invalid("invalid-source-id");
  if (source !== undefined && id !== undefined && source !== id)
    return invalid("source-id-conflict");
  if (stableId(source)) return source;
  if (stableId(id)) return id;
  return invalid("missing-source-id");
}
function heroesFor(record: Row): string[] {
  if (record.hero !== undefined && typeof record.hero !== "string")
    return invalid("invalid-hero-field");
  if (record.heroes !== undefined && !Array.isArray(record.heroes))
    return invalid("invalid-heroes-field");
  const primary = record.hero === "Common" ? "Neutral" : record.hero;
  if (typeof primary === "string" && primary && !HEROES.has(primary))
    return invalid("unknown-hero");
  const input =
    Array.isArray(record.heroes) && record.heroes.length
      ? record.heroes
      : typeof primary === "string" && primary
        ? [primary]
        : [];
  if (!input.length || input.length > 20)
    return invalid("missing-or-invalid-heroes");
  const heroes = input.map((hero) => (hero === "Common" ? "Neutral" : hero));
  if (heroes.some((hero) => typeof hero !== "string" || !HEROES.has(hero)))
    return invalid("unknown-hero");
  if (
    typeof primary === "string" &&
    primary &&
    Array.isArray(record.heroes) &&
    record.heroes.length &&
    !heroes.includes(primary)
  )
    return invalid("hero-field-conflict");
  return dedupe(heroes as string[]);
}
function activityFor(
  record: Row,
  name: string,
): "excluded" | "uncertain" | "source-declared-active" {
  if (
    /^\s*\[debug\]/i.test(name) ||
    record.is_debug === true ||
    record.IsDebug === true
  )
    return "excluded";
  if (
    /^\s*\[[^\]]*\btemplate\]/i.test(name) ||
    record.is_template === true ||
    record.IsTemplate === true
  )
    return "excluded";
  const inactive =
    ["active", "Active", "is_active", "IsActive"].some(
      (k) => record[k] === false,
    ) ||
    ["disabled", "Disabled", "is_disabled", "IsDisabled"].some(
      (k) => record[k] === true,
    );
  if (inactive) return "excluded";
  const declared = ["active", "Active", "is_active", "IsActive"].some(
    (k) => record[k] === true,
  );
  return declared ? "source-declared-active" : "uncertain";
}
function exclusionReason(record: Row, name: string): string {
  if (
    /^\s*\[debug\]/i.test(name) ||
    record.is_debug === true ||
    record.IsDebug === true
  )
    return "debug-marker";
  if (
    /^\s*\[[^\]]*\btemplate\]/i.test(name) ||
    record.is_template === true ||
    record.IsTemplate === true
  )
    return "template-marker";
  return "source-declared-inactive";
}
function references(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some((v) => typeof v !== "string" || v.length > 250)
  )
    return invalid(`invalid-${label}-references`);
  return dedupe(value as string[]);
}
function definitions(value: unknown, label: string): Row {
  if (value === undefined) return {};
  if (!row(value) || Object.keys(value).length > 1000)
    return invalid(`invalid-${label}-definitions`);
  return value;
}
function resolveDefinition(definitions: Row, reference: string): Row | null {
  const matches: Row[] = [];
  const direct = own(definitions, reference) ? definitions[reference] : null;
  if (row(direct)) matches.push(direct);
  for (const candidate of Object.values(definitions)) {
    if (
      row(candidate) &&
      candidate.Id === reference &&
      !matches.includes(candidate)
    )
      matches.push(candidate);
  }
  return matches.length === 1 ? matches[0] : null;
}
function definitionIsSelected(
  definition: Row,
  key: string,
  selected: string[] | null,
): boolean {
  return (
    selected !== null &&
    (selected.includes(key) ||
      (typeof definition.Id === "string" && selected.includes(definition.Id)))
  );
}
/** Only explicit display scalars/attribute references are interpreted. Action types are never guessed. */
function displayScalar(
  value: unknown,
  attrs: Record<string, string | number>,
): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
    return value;
  if (
    !row(value) ||
    typeof value.Attribute !== "string" ||
    !own(attrs, value.Attribute)
  )
    return null;
  if (Object.keys(value).some((k) => !["Attribute", "Divisor"].includes(k)))
    return null;
  const attribute = attrs[value.Attribute];
  const divisor = value.Divisor === undefined ? 1 : value.Divisor;
  if (
    typeof attribute !== "number" ||
    typeof divisor !== "number" ||
    !Number.isFinite(divisor) ||
    divisor <= 0
  )
    return null;
  const quotient = attribute / divisor;
  return Number.isFinite(quotient) ? String(quotient) : null;
}
function renderDescription(
  description: string,
  attrs: Record<string, string | number>,
  abilities: Row,
  auras: Row,
  selectedAbilities: string[] | null,
  selectedAuras: string[] | null,
): { effect: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const effect = description.replace(
    /\{([^{}]{1,200})\}/g,
    (token, expression: string) => {
      const direct = /^attribute\.([A-Za-z][A-Za-z0-9_]*)$/.exec(expression);
      if (direct && own(attrs, direct[1])) return String(attrs[direct[1]]);
      const reference = /^(ability|aura)\.([^\s.{}]+)$/.exec(expression);
      if (reference) {
        const definitionsMap = reference[1] === "ability" ? abilities : auras;
        const selected =
          reference[1] === "ability" ? selectedAbilities : selectedAuras;
        const definition = resolveDefinition(definitionsMap, reference[2]);
        if (
          definition &&
          definitionIsSelected(definition, reference[2], selected)
        ) {
          const explicit =
            own(definition, "TooltipValue") && own(definition, "DisplayValue")
              ? null
              : own(definition, "TooltipValue")
                ? definition.TooltipValue
                : definition.DisplayValue;
          const resolved = displayScalar(explicit, attrs);
          if (resolved !== null) return resolved;
        }
      }
      unresolved.push(token);
      return `〔미해석: ${token}〕`;
    },
  );
  return { effect, unresolved: dedupe(unresolved) };
}

function convertRecord(
  record: Row,
  id: string,
  options: RawImportOptions,
): CatalogItem {
  if (!text(record.name, 300) || !record.name.trim())
    return invalid("missing-item-name");
  const size =
    typeof record.size === "string" && own(SIZES, record.size)
      ? SIZES[record.size]
      : undefined;
  if (!size) return invalid("unknown-size");
  const heroes = heroesFor(record);
  if (
    !Array.isArray(record.tags) ||
    record.tags.length > 100 ||
    record.tags.some((t) => typeof t !== "string" || t.length > 150)
  )
    return invalid("invalid-tags");
  if (
    !Array.isArray(record.tiers) ||
    !record.tiers.length ||
    record.tiers.length > 5 ||
    record.tiers.some(
      (t) =>
        typeof t !== "string" ||
        ![...ORDER, "Legendary"].includes(t as (typeof ORDER)[number]),
    )
  )
    return invalid("unknown-or-missing-tiers");
  if (!row(record.raw_effects) || !row(record.raw_effects.tiers_raw))
    return invalid("missing-raw-tier-data");
  const rawTiers = record.raw_effects.tiers_raw;
  if (
    Object.keys(rawTiers).some(
      (t) => ![...ORDER, "Legendary"].includes(t as (typeof ORDER)[number]),
    )
  )
    return invalid("unknown-raw-tier");
  const abilities = definitions(record.raw_effects.abilities, "ability");
  const auras = definitions(record.raw_effects.auras, "aura");
  const warnings: string[] = [];
  const unsupportedTiers = record.tiers.filter(
    (t) => t === "Legendary",
  ) as string[];
  if (unsupportedTiers.length)
    warnings.push(
      "Legendary 등급은 현재 보드 UI에서 지원하지 않아 표시하지 않습니다.",
    );
  const description = text(record.description) ? record.description : "";
  if (!description)
    warnings.push("효과 설명이 비어 있어 원문 수치만 표시합니다.");
  const tiers: CatalogItem["tiers"] = {};
  const unresolvedByTier: Partial<Record<TierKey, string[]>> = {};
  const abilityRefsByTier: Partial<
    Record<TierKey, { abilityIds: string[]; auraIds: string[] }>
  > = {};
  let attributes: Record<string, string | number> = {};
  let selectedAbilities: string[] | null = null;
  let selectedAuras: string[] | null = null;
  for (const tierName of ORDER) {
    if (!record.tiers.includes(tierName)) continue;
    const tier = own(rawTiers, tierName) ? rawTiers[tierName] : undefined;
    if (!row(tier)) return invalid("missing-declared-tier-data");
    if (tier.Attributes !== undefined && !row(tier.Attributes))
      return invalid("invalid-tier-attributes");
    if (row(tier.Attributes)) {
      if (Object.keys(tier.Attributes).length > 200)
        return invalid("too-many-tier-attributes");
      attributes = { ...attributes };
      for (const [key, value] of Object.entries(tier.Attributes)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(key))
          return invalid("invalid-attribute-key");
        if (
          (typeof value === "number" && Number.isFinite(value)) ||
          (typeof value === "string" && value.length <= 2000)
        )
          attributes[key] = value;
        else {
          delete attributes[key];
          warnings.push(
            `${tierName}.${key}: 명시적 null/복합 값의 의미는 미해석입니다.`,
          );
        }
      }
    }
    if (own(tier, "AbilityIds"))
      selectedAbilities = references(tier.AbilityIds, "ability");
    else if (selectedAbilities !== null)
      warnings.push(
        `${tierName}: 생략된 AbilityIds는 이전 등급을 유지했습니다. 원본의 전체 상속 규칙은 미확인입니다.`,
      );
    if (own(tier, "AuraIds")) selectedAuras = references(tier.AuraIds, "aura");
    else if (selectedAuras !== null)
      warnings.push(
        `${tierName}: 생략된 AuraIds는 이전 등급을 유지했습니다. 원본의 전체 상속 규칙은 미확인입니다.`,
      );
    const key = tierName.toLowerCase() as TierKey;
    const refs = {
      abilityIds: selectedAbilities ? [...selectedAbilities] : [],
      auraIds: selectedAuras ? [...selectedAuras] : [],
    };
    abilityRefsByTier[key] = refs;
    if (selectedAbilities === null || selectedAuras === null)
      warnings.push(
        `${tierName}: 선택된 능력/지속 효과 참조가 명시되지 않았습니다.`,
      );
    for (const [kind, ids, defs] of [
      ["ability", refs.abilityIds, abilities],
      ["aura", refs.auraIds, auras],
    ] as const) {
      for (const ref of ids)
        if (!resolveDefinition(defs, ref))
          warnings.push(`${tierName}: ${kind} 참조 ${ref}의 정의가 없습니다.`);
    }
    const rendered = renderDescription(
      description,
      attributes,
      abilities,
      auras,
      selectedAbilities,
      selectedAuras,
    );
    if (rendered.effect.length > 10000 || rendered.unresolved.length > 200)
      return invalid("expanded-description-too-large");
    unresolvedByTier[key] = rendered.unresolved;
    tiers[key] = {
      effects: rendered.effect
        ? [rendered.effect]
        : ["〔미해석: 원문 효과 설명 없음〕"],
      stats: { ...attributes },
    };
  }
  if (!Object.keys(tiers).length) return invalid("no-supported-tier-data");
  const activity = activityFor(record, record.name);
  return {
    id: `local-raw:${id}`,
    nameEn: record.name,
    nameKo: null,
    translationStatus: "untranslated",
    heroes,
    size: size as 1 | 2 | 3,
    tags: dedupe(record.tags as string[]),
    tiers,
    image: { path: null, sourceUrl: null, status: "missing" },
    source: {
      id,
      url: `local://cards-generated/${encodeURIComponent(id)}`,
      patchVersion: options.patchVersion?.trim() || "unverified-local",
    },
    local: {
      activity: activity === "source-declared-active" ? activity : "uncertain",
      warnings:
        dedupe(warnings).length <= 100
          ? dedupe(warnings)
          : [
              ...dedupe(warnings).slice(0, 99),
              "추가 경고가 너무 많아 일부 표시를 생략했습니다.",
            ],
      unresolvedByTier,
      abilityRefsByTier,
      rawId: typeof record.id === "string" ? record.id : null,
      unsupportedTiers,
    },
  };
}

export function importRawCatalog(
  value: unknown,
  options: RawImportOptions = {},
): { items: CatalogItem[]; report: RawImportReport } {
  if (!row(value))
    throw Error("원본 JSON은 아이템 이름을 키로 하는 객체여야 합니다.");
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 20000)
    throw Error("원본 레코드는 1~20,000개여야 합니다.");
  if (
    options.patchVersion &&
    (!text(options.patchVersion, 100) || !options.patchVersion.trim())
  )
    throw Error("패치 메모는 100자 이하여야 합니다.");
  const report: RawImportReport = {
    totalRecords: entries.length,
    importedCount: 0,
    excluded: [],
    quarantined: [],
    unresolvedCount: 0,
    warnings: [],
    fileName: options.fileName?.slice(0, 250) || null,
    sha256:
      options.sha256 && /^[a-f0-9]{64}$/i.test(options.sha256)
        ? options.sha256
        : null,
    patchVersion: options.patchVersion?.trim() || null,
    uncertainActivityCount: 0,
  };
  const accepted = new Map<
    string,
    { key: string; item: CatalogItem; fingerprint: string }
  >();
  const conflicts = new Set<string>();
  for (const [key, candidate] of entries) {
    if (key.length > 300) {
      report.quarantined.push({
        key: `${key.slice(0, 270)}… (${key.length} chars)`,
        reason: "record-key-too-long",
      });
      continue;
    }
    let id: string | undefined;
    try {
      if (!row(candidate)) return invalid("invalid-record");
      if (candidate.type !== "Item") {
        report.excluded.push({
          key,
          reason:
            candidate.type === "Skill" ? "skill-record" : "non-item-record",
        });
        continue;
      }
      const name = typeof candidate.name === "string" ? candidate.name : key;
      const activity = activityFor(candidate, name);
      if (activity === "excluded") {
        report.excluded.push({ key, reason: exclusionReason(candidate, name) });
        continue;
      }
      id = sourceId(candidate);
      if (conflicts.has(id)) {
        report.quarantined.push({
          key,
          id,
          reason: "conflicting-duplicate-id",
        });
        continue;
      }
      const fingerprint = canonical(candidate);
      const previous = accepted.get(id);
      if (previous) {
        if (previous.fingerprint === fingerprint) {
          report.excluded.push({ key, id, reason: "identical-duplicate-id" });
          continue;
        }
        accepted.delete(id);
        conflicts.add(id);
        report.quarantined.push(
          { key: previous.key, id, reason: "conflicting-duplicate-id" },
          { key, id, reason: "conflicting-duplicate-id" },
        );
        continue;
      }
      accepted.set(id, {
        key,
        item: convertRecord(candidate, id, options),
        fingerprint,
      });
    } catch (error) {
      report.quarantined.push({
        key,
        ...(id ? { id } : {}),
        reason: error instanceof Error ? error.message : "invalid-record",
      });
    }
  }
  const items = [...accepted.values()]
    .map((v) => v.item)
    .sort((a, b) => a.nameEn.localeCompare(b.nameEn));
  report.importedCount = items.length;
  report.uncertainActivityCount = items.filter(
    (i) => i.local?.activity === "uncertain",
  ).length;
  report.unresolvedCount = items.reduce(
    (sum, i) =>
      sum +
      Object.values(i.local?.unresolvedByTier || {}).reduce(
        (n, tokens) => n + (tokens?.length || 0),
        0,
      ),
    0,
  );
  const reportWarnings = new Set<string>();
  if (!options.patchVersion)
    reportWarnings.add(
      "파일에 공식 패치 버전 메타데이터가 없어 패치를 확인하지 못했습니다.",
    );
  if (report.uncertainActivityCount)
    reportWarnings.add(
      "활성 여부를 확인할 근거가 없는 아이템은 활성 상태 불확실로 표시합니다.",
    );
  let warningsTruncated = false;
  collectWarnings: for (const item of items) {
    for (const warning of item.local?.warnings || []) {
      if (reportWarnings.has(warning)) continue;
      if (reportWarnings.size >= 1999) {
        warningsTruncated = true;
        break collectWarnings;
      }
      reportWarnings.add(warning);
    }
  }
  if (warningsTruncated)
    reportWarnings.add(
      "전체 경고가 너무 많아 2,000개 이내로 일부 표시를 생략했습니다.",
    );
  report.warnings = [...reportWarnings];
  return { items, report };
}
