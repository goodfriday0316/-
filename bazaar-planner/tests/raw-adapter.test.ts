/** Synthetic structures only. No original game names, values, IDs, or assets. */
import test from "node:test";
import assert from "node:assert/strict";
import { importRawCatalog } from "../src/raw-adapter.ts";

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "synthetic-source-1",
    source_id: "synthetic-source-1",
    template_id: "synthetic-template",
    internal_name: "SyntheticInternal",
    name: "SYNTHETIC LOCAL DEVICE",
    hero: "Vanessa",
    heroes: ["Vanessa"],
    type: "Item",
    size: "Medium",
    min_rarity: "Bronze",
    max_rarity: "Gold",
    rarity: "Bronze",
    tiers: ["Bronze", "Silver", "Gold"],
    tags: ["synthetic"],
    visible_tags: ["synthetic"],
    hidden_tags: [],
    buy_prices: {},
    sell_prices: {},
    description:
      "Synthetic value {ability.0}; duration {ability.1}; direct {attribute.Power}.",
    card_pack_id: "synthetic-pack",
    raw_effects: {
      abilities: {
        "0": {
          Id: "synthetic-ability-a",
          TooltipValue: { Attribute: "Power" },
          Action: { $type: "SyntheticUnknownAction" },
        },
        "1": {
          Id: "synthetic-ability-b",
          DisplayValue: { Attribute: "Duration", Divisor: 1000 },
        },
      },
      auras: {},
      tiers_raw: {
        Bronze: {
          Attributes: { Power: 17, Duration: 2500, CooldownMax: 7300 },
          AbilityIds: ["synthetic-ability-a", "synthetic-ability-b"],
          AuraIds: [],
        },
        Silver: { Attributes: { Power: 41 } },
        Gold: { Attributes: { Power: 0 } },
      },
    },
    raw_effect_fields: ["abilities", "auras", "tiers_raw"],
    ...overrides,
  };
}
function load(record = card()) {
  return importRawCatalog({ "SYNTHETIC KEY": record });
}

test("stable source ID remains unchanged across name/key changes; conflicting identity quarantines", () => {
  const one = load().items[0];
  const renamed = importRawCatalog({
    "DIFFERENT SYNTHETIC KEY": card({ name: "RENAMED SYNTHETIC" }),
  }).items[0];
  assert.equal(one.id, "local-raw:synthetic-source-1");
  assert.equal(one.id, renamed.id);
  assert.equal(one.source.id, "synthetic-source-1");
  const conflict = load(card({ id: "synthetic-other-id" }));
  assert.equal(conflict.items.length, 0);
  assert.equal(conflict.report.quarantined[0].reason, "source-id-conflict");
  const missing = load(card({ id: undefined, source_id: undefined }));
  assert.equal(missing.report.quarantined[0].reason, "missing-source-id");
});
test("all three raw size names map to slots; Common maps Neutral; multi-hero lists persist", () => {
  for (const [size, slots] of [
    ["Small", 1],
    ["Medium", 2],
    ["Large", 3],
  ] as const) {
    const result = load(
      card({
        size,
        hero: "",
        heroes: ["Common", "Vanessa", "Vanessa", "Dooley"],
      }),
    );
    assert.equal(result.items[0].size, slots);
    assert.deepEqual(result.items[0].heroes, ["Neutral", "Vanessa", "Dooley"]);
  }
  assert.equal(
    load(card({ heroes: ["Hero8"] })).report.quarantined[0].reason,
    "unknown-hero",
  );
  assert.equal(
    load(card({ size: "Unexpected" })).report.quarantined[0].reason,
    "unknown-size",
  );
});
test("cumulative Attributes inherit omitted values, explicit zero wins and lower grades are not invented", () => {
  const item = load().items[0];
  assert.deepEqual(item.tiers.silver?.stats, {
    Power: 41,
    Duration: 2500,
    CooldownMax: 7300,
  });
  assert.equal(item.tiers.gold?.stats?.Power, 0);
  assert.equal(item.tiers.bronze?.stats?.Power, 17);
  const raw = card();
  raw.tiers = ["Silver", "Gold"];
  raw.raw_effects.tiers_raw = {
    Silver: {
      Attributes: { Power: 41, Duration: 2500, CooldownMax: 7300 },
      AbilityIds: ["synthetic-ability-a", "synthetic-ability-b"],
      AuraIds: [],
    },
    Gold: { Attributes: { Power: 0 } },
  } as typeof raw.raw_effects.tiers_raw;
  const onlyUpper = load(raw).items[0];
  assert.equal(onlyUpper.tiers.bronze, undefined);
  assert.equal(onlyUpper.tiers.gold?.stats?.Duration, 2500);
});
test("explicit null/complex values do not silently reuse prior values and are warned", () => {
  const raw = card();
  raw.raw_effects.tiers_raw.Silver.Attributes = {
    Power: null,
    Duration: { unknown: true },
  } as unknown as typeof raw.raw_effects.tiers_raw.Silver.Attributes;
  const item = load(raw).items[0];
  assert.equal(item.tiers.silver?.stats?.Power, undefined);
  assert.equal(item.tiers.silver?.stats?.Duration, undefined);
  assert.equal(item.tiers.silver?.stats?.CooldownMax, 7300);
  assert.ok(item.local?.warnings.some((w) => w.includes("null/복합")));
});
test("indexed and ID ability references resolve only explicit tooltip/display sources with explicit divisor", () => {
  const item = load().items[0];
  assert.equal(
    item.tiers.bronze?.effects[0],
    "Synthetic value 17; duration 2.5; direct 17.",
  );
  assert.equal(
    item.tiers.silver?.effects[0],
    "Synthetic value 41; duration 2.5; direct 41.",
  );
  assert.equal(
    item.tiers.gold?.effects[0],
    "Synthetic value 0; duration 2.5; direct 0.",
  );
  assert.deepEqual(item.local?.abilityRefsByTier.gold?.abilityIds, [
    "synthetic-ability-a",
    "synthetic-ability-b",
  ]);
  const byId = load(
    card({ description: "Value {ability.synthetic-ability-a}" }),
  ).items[0];
  assert.equal(byId.tiers.bronze?.effects[0], "Value 17");
});
test("unknown Action types never guess attribute mapping; missing definitions remain visibly unresolved", () => {
  const raw = card();
  delete (raw.raw_effects.abilities["0"] as Record<string, unknown>)
    .TooltipValue;
  raw.description =
    "Value {ability.0} and {ability.missing} and {unexpected.token}";
  const result = load(raw);
  const item = result.items[0];
  assert.match(item.tiers.bronze!.effects[0], /미해석: \{ability\.0\}/);
  assert.equal(item.local?.unresolvedByTier.bronze?.length, 3);
  assert.equal(result.report.unresolvedCount, 9);
  assert.ok(!item.tiers.bronze?.effects[0].includes("Value 17"));
});
test("missing refs retain previous lists with uncertainty warnings; explicit empty lists clear them", () => {
  const raw = card();
  (raw.raw_effects.tiers_raw.Gold as Record<string, unknown>).AbilityIds = [];
  const item = load(raw).items[0];
  assert.equal(
    item.tiers.silver?.effects[0],
    "Synthetic value 41; duration 2.5; direct 41.",
  );
  assert.ok(
    item.local?.warnings.some((w) => w.includes("전체 상속 규칙은 미확인")),
  );
  assert.deepEqual(item.local?.abilityRefsByTier.gold?.abilityIds, []);
  assert.match(item.tiers.gold!.effects[0], /미해석/);
});
test("debug/template/declared-inactive/skill excluded, ordinary Test name remains uncertain", () => {
  const value = {
    a: card({ name: "[DEBUG] SYNTHETIC" }),
    b: card({ name: "[SYNTHETIC TEMPLATE]" }),
    c: card({ active: false }),
    d: card({ type: "Skill" }),
    e: card({ name: "SYNTHETIC Test Bench" }),
  };
  const result = importRawCatalog(value);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].nameEn, "SYNTHETIC Test Bench");
  assert.equal(result.items[0].local?.activity, "uncertain");
  assert.equal(result.report.excluded.length, 4);
  assert.equal(result.report.uncertainActivityCount, 1);
  const declared = load(card({ active: true }));
  assert.equal(declared.items[0].local?.activity, "source-declared-active");
});
test("conflicting duplicate canonical IDs quarantine both, identical duplicates deduplicate", () => {
  const conflict = importRawCatalog({ a: card(), b: card({ size: "Large" }) });
  assert.equal(conflict.items.length, 0);
  assert.equal(conflict.report.quarantined.length, 2);
  const duplicate = importRawCatalog({ a: card(), b: card() });
  assert.equal(duplicate.items.length, 1);
  assert.equal(duplicate.report.excluded[0].reason, "identical-duplicate-id");
});
test("Legendary is reported unsupported and is never mapped to another grade", () => {
  const raw = card();
  raw.tiers.push("Legendary");
  (raw.raw_effects.tiers_raw as Record<string, unknown>).Legendary = {
    Attributes: { Power: 222 },
  };
  const item = load(raw).items[0];
  assert.ok(item.local?.unsupportedTiers?.includes("Legendary"));
  assert.equal("legendary" in item.tiers, false);
  assert.equal(item.tiers.gold?.stats?.Power, 0);
  const only = card({
    tiers: ["Legendary"],
    raw_effects: {
      abilities: {},
      auras: {},
      tiers_raw: { Legendary: { Attributes: { Power: 222 } } },
    },
  });
  assert.equal(
    load(only).report.quarantined[0].reason,
    "no-supported-tier-data",
  );
});
test("no image URL is fetched or used; patch is unverified unless explicitly supplied", () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    throw Error("forbidden");
  };
  try {
    const result = importRawCatalog(
      { a: card({ imageUrl: "https://untrusted.invalid/picture.png" }) },
      { fileName: "patch-99.99.json" },
    );
    assert.equal(requests, 0);
    assert.deepEqual(result.items[0].image, {
      path: null,
      sourceUrl: null,
      status: "missing",
    });
    assert.equal(result.items[0].source.patchVersion, "unverified-local");
    assert.equal(result.report.patchVersion, null);
    assert.equal(
      importRawCatalog({ a: card() }, { patchVersion: "user-note" }).items[0]
        .source.patchVersion,
      "user-note",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("malformed root rejects while invalid individual records quarantine without destroying valid records", () => {
  assert.throws(() => importRawCatalog([]));
  assert.throws(() => importRawCatalog({}));
  const result = importRawCatalog({ bad: null, valid: card() });
  assert.equal(result.items.length, 1);
  assert.equal(result.report.quarantined[0].reason, "invalid-record");
});

test("prototype property names cannot masquerade as size/definition mappings", () => {
  for (const size of ["constructor", "toString", "__proto__"])
    assert.equal(
      load(card({ size })).report.quarantined[0].reason,
      "unknown-size",
    );
  const raw = card({ description: "Value {ability.__proto__}" });
  assert.match(load(raw).items[0].tiers.bronze!.effects[0], /미해석/);
});
test("ambiguous definition index/ID collisions and conflicting display sources stay unresolved", () => {
  const raw = card({ description: "Value {ability.synthetic-ability-a}" });
  (raw.raw_effects.abilities as Record<string, unknown>)[
    "synthetic-ability-a"
  ] = { Id: "synthetic-different", TooltipValue: 999 };
  assert.match(load(raw).items[0].tiers.bronze!.effects[0], /미해석/);
  const conflict = card({ description: "Value {ability.0}" });
  (
    conflict.raw_effects.abilities["0"] as Record<string, unknown>
  ).DisplayValue = 999;
  assert.match(load(conflict).items[0].tiers.bronze!.effects[0], /미해석/);
});
test("oversized unresolved explanations quarantine instead of breaking persisted snapshots", () => {
  const raw = card({
    description: Array.from({ length: 201 }, (_, i) => `{unknown${i}}`).join(
      " ",
    ),
  });
  assert.equal(
    load(raw).report.quarantined[0].reason,
    "expanded-description-too-large",
  );
  const long = card({ description: "{x}".repeat(1800) });
  assert.equal(
    load(long).report.quarantined[0].reason,
    "expanded-description-too-large",
  );
});
test("high warning counts are explicitly capped within snapshot contract", () => {
  const raw = card();
  const complex = Object.fromEntries(
    Array.from({ length: 150 }, (_, i) => ["Field" + i, null]),
  );
  raw.raw_effects.tiers_raw.Silver.Attributes =
    complex as unknown as typeof raw.raw_effects.tiers_raw.Silver.Attributes;
  const item = load(raw).items[0];
  assert.ok(item.local!.warnings.length <= 100);
  assert.match(item.local!.warnings.at(-1)!, /일부 표시를 생략/);
});

test("overflowing explicit display division is unresolved instead of displaying Infinity", () => {
  const raw = card({ description: "Value {ability.0}" });
  raw.raw_effects.abilities["0"].TooltipValue = {
    Attribute: "Power",
    Divisor: Number.MIN_VALUE,
  } as unknown as (typeof raw.raw_effects.abilities)["0"]["TooltipValue"];
  const result = load(raw);
  assert.match(result.items[0].tiers.bronze!.effects[0], /미해석/);
  assert.ok(!result.items[0].tiers.bronze!.effects[0].includes("Infinity"));
  assert.equal(result.items[0].local?.unresolvedByTier.bronze?.length, 1);
});
test("aggregate warnings are capped including an explicit truncation notice", () => {
  const records: Record<string, unknown> = {};
  for (let i = 0; i < 2005; i++) {
    const raw = card({
      id: `synthetic-many-${i}`,
      source_id: `synthetic-many-${i}`,
    });
    raw.raw_effects.tiers_raw.Silver.Attributes = {
      ["Field" + i]: null,
    } as unknown as typeof raw.raw_effects.tiers_raw.Silver.Attributes;
    records["synthetic-key-" + i] = raw;
  }
  const result = importRawCatalog(records);
  assert.equal(result.items.length, 2005);
  assert.ok(result.report.warnings.length <= 2000);
  assert.match(result.report.warnings.at(-1)!, /일부 표시를 생략/);
});

test("a declared tier with a missing raw entry quarantines instead of inheriting across the gap", () => {
  for (const missing of ["Bronze", "Silver", "Gold"]) {
    const raw = card();
    delete (raw.raw_effects.tiers_raw as Record<string, unknown>)[missing];
    const result = load(raw);
    assert.equal(result.items.length, 0);
    assert.equal(
      result.report.quarantined[0].reason,
      "missing-declared-tier-data",
    );
    assert.equal(result.report.importedCount, 0);
  }
});
test("oversized root keys quarantine before record processing and never leak the full key into report", () => {
  const huge = "SYNTHETIC_LONG_KEY_".repeat(1000);
  const result = importRawCatalog({
    [huge]: card(),
    valid: card({
      id: "synthetic-valid-second",
      source_id: "synthetic-valid-second",
    }),
  });
  assert.equal(result.report.totalRecords, 2);
  assert.equal(result.report.importedCount, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.report.quarantined[0].reason, "record-key-too-long");
  assert.ok(result.report.quarantined[0].key.length <= 300);
  assert.ok(!JSON.stringify(result.report).includes(huge));
  assert.equal(result.report.excluded.length, 0);
});

test("hero fields support consistent aliases, omitted plural fallback and shared empty primary", () => {
  assert.deepEqual(
    load(card({ hero: "Common", heroes: ["Common"] })).items[0].heroes,
    ["Neutral"],
  );
  assert.deepEqual(
    load(card({ hero: "Neutral", heroes: ["Common"] })).items[0].heroes,
    ["Neutral"],
  );
  assert.deepEqual(
    load(
      JSON.parse(JSON.stringify(card({ hero: "Common", heroes: undefined }))),
    ).items[0].heroes,
    ["Neutral"],
  );
  assert.deepEqual(load(card({ hero: "Dooley", heroes: [] })).items[0].heroes, [
    "Dooley",
  ]);
  assert.deepEqual(
    load(card({ hero: "", heroes: ["Vanessa", "Dooley"] })).items[0].heroes,
    ["Vanessa", "Dooley"],
  );
  assert.deepEqual(
    load(
      JSON.parse(JSON.stringify(card({ hero: undefined, heroes: ["Dooley"] }))),
    ).items[0].heroes,
    ["Dooley"],
  );
});
test("malformed hero fields quarantine rather than silently falling back", () => {
  for (const heroes of ["Vanessa", {}, null])
    assert.equal(
      load(card({ heroes })).report.quarantined[0].reason,
      "invalid-heroes-field",
    );
  for (const hero of [12, {}, null, []])
    assert.equal(
      load(card({ hero })).report.quarantined[0].reason,
      "invalid-hero-field",
    );
});
test("conflicting primary and plural heroes or an unknown primary quarantine", () => {
  assert.equal(
    load(card({ hero: "Vanessa", heroes: ["Dooley"] })).report.quarantined[0]
      .reason,
    "hero-field-conflict",
  );
  assert.equal(
    load(card({ hero: "Common", heroes: ["Vanessa"] })).report.quarantined[0]
      .reason,
    "hero-field-conflict",
  );
  assert.equal(
    load(card({ hero: "Hero8", heroes: ["Vanessa"] })).report.quarantined[0]
      .reason,
    "unknown-hero",
  );
});
