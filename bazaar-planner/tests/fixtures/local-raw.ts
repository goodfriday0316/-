/** Authored synthetic values only. Never imported by the shipped application. */
export function syntheticRawCard(
  id: string,
  name: string,
  size: string = "Small",
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    source_id: id,
    template_id: "synthetic-template",
    internal_name: "PRIVATE_SYNTHETIC_CANARY_DO_NOT_SEND",
    name,
    hero: "Vanessa",
    heroes: ["Vanessa"],
    type: "Item",
    size,
    min_rarity: "Bronze",
    max_rarity: "Gold",
    rarity: "Bronze",
    tiers: ["Bronze", "Silver", "Gold"],
    tags: ["Synthetic", "Tool"],
    visible_tags: ["Tool"],
    hidden_tags: [],
    buy_prices: {},
    sell_prices: {},
    description: "Value {ability.0}; duration {attribute.Duration}.",
    card_pack_id: "synthetic-pack",
    raw_effects: {
      abilities: {
        "0": {
          Id: "synthetic-ability-a",
          TooltipValue: { Attribute: "Power" },
          Action: { $type: "SyntheticUnknownAction" },
        },
      },
      auras: {},
      tiers_raw: {
        Bronze: {
          Attributes: { Power: 17, Duration: 2500, CooldownMax: 7300 },
          AbilityIds: ["synthetic-ability-a"],
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
export function syntheticLocalFile() {
  const medium = syntheticRawCard(
    "synthetic-medium",
    "SYNTHETIC MEDIUM",
    "Medium",
    { heroes: ["Common", "Vanessa"], hero: "" },
  );
  delete (medium.raw_effects.abilities["0"] as Record<string, unknown>)
    .TooltipValue;
  return {
    small: syntheticRawCard("synthetic-small", "SYNTHETIC SMALL"),
    medium,
    large: syntheticRawCard("synthetic-large", "SYNTHETIC LARGE", "Large", {
      active: true,
    }),
    debug: syntheticRawCard("synthetic-debug", "[DEBUG] SYNTHETIC DEVICE"),
    template: syntheticRawCard("synthetic-template", "[SYNTHETIC TEMPLATE]"),
    inactive: syntheticRawCard(
      "synthetic-inactive",
      "SYNTHETIC INACTIVE",
      "Small",
      { active: false },
    ),
    skill: syntheticRawCard("synthetic-skill", "SYNTHETIC SKILL", "Small", {
      type: "Skill",
    }),
    unknown: syntheticRawCard(
      "synthetic-unknown",
      "SYNTHETIC UNKNOWN",
      "Small",
      { heroes: ["Hero8"] },
    ),
  };
}
