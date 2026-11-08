import { describe, expect, it } from "vitest";
import type { MatchItem } from "@/features/matching/gates";
import {
  ABSENT_PREFERENCES_GUIDANCE,
  validateOptionComposition,
  type OutfitOption,
} from "./schema";

const topId = "27521082-6561-47ac-a732-ae19901b7849";
const bottomId = "e76c4e28-79f8-4f4c-8bbd-61b44504ae26";
const inventory: MatchItem[] = [
  {
    id: topId,
    name: "Shirt",
    category: "top",
    subcategory: "shirt",
    attributes: {},
    sourceType: "sample",
    revision: 1,
    inventoryStatus: "owned",
  },
  {
    id: bottomId,
    name: "Trousers",
    category: "bottom",
    subcategory: "trousers",
    attributes: {},
    sourceType: "sample",
    revision: 1,
    inventoryStatus: "owned",
  },
];
const outfit = (): OutfitOption => ({
  optionType: "from_wardrobe",
  title: "Relaxed layers",
  concept: "Shirt and trousers",
  status: "ready",
  explanation: {
    summary: "Owned pieces",
    whyThis: [],
    inputsUsed: [],
    differences: [],
    uncertainty: [],
    sourceRevision: 1,
  },
  items: inventory.map((item) => ({
    slotId: `${item.category}_1`,
    category: item.category as "top" | "bottom",
    itemKind: "owned",
    pieceId: null,
    wardrobeItemId: item.id,
    missingBrief: null,
    rationale: "Uses the supplied owned garment.",
  })),
});
const suppliedPreferences: Record<string, string | string[]>[] = [
  { undertone: "warm" },
  { styles: ["minimal"] },
  { fit: "relaxed" },
];
const absentPreferences: Record<string, string | string[]>[] = [
  {},
  { styles: [], fit: "" },
  { styles: [" "], fit: " " },
];

describe("outfit composition boundaries", () => {
  it.each(suppliedPreferences)(
    "rejects the observed closest absence claim when preferences are supplied: %j",
    (preferences) => {
      const option = { ...outfit(), optionType: "closest" as const };
      option.explanation.uncertainty = [ABSENT_PREFERENCES_GUIDANCE];
      expect(
        validateOptionComposition([option], [], inventory, "closest", {
          preferences,
          occasion: null,
        }),
      ).toEqual(["supplied_preferences_marked_absent"]);
      expect(option.explanation.uncertainty).toEqual([
        ABSENT_PREFERENCES_GUIDANCE,
      ]);
    },
  );
  it.each(absentPreferences)(
    "retains the absence guidance when no preference value is supplied: %j",
    (preferences) => {
      const option = outfit();
      option.explanation.uncertainty = [ABSENT_PREFERENCES_GUIDANCE];
      expect(
        validateOptionComposition([option], [], inventory, "from_wardrobe", {
          preferences,
          occasion: null,
        }),
      ).toEqual([]);
    },
  );
  it.each([
    `Material composition is unverified. ${ABSENT_PREFERENCES_GUIDANCE}`,
    `${ABSENT_PREFERENCES_GUIDANCE} Stitching is not visible.`,
  ])("rejects the exact absence claim embedded in uncertainty: %s", (note) => {
    const option = { ...outfit(), optionType: "closest" as const };
    option.explanation.uncertainty = [note];
    expect(
      validateOptionComposition([option], [], inventory, "closest", {
        preferences: { fit: "relaxed" },
        occasion: null,
      }),
    ).toEqual(["supplied_preferences_marked_absent"]);
    expect(option.explanation.uncertainty).toEqual([note]);
  });
  it("retains specific uncertainty about an unselected field", () => {
    const option = outfit();
    option.explanation.uncertainty = ["Body proportions were not supplied."];
    expect(
      validateOptionComposition([option], [], inventory, "from_wardrobe", {
        preferences: { undertone: "warm" },
        occasion: null,
      }),
    ).toEqual([]);
  });
  it("accepts complete owned composition and unavailable empty wardrobe direction", () => {
    expect(
      validateOptionComposition([outfit()], [], inventory, "from_wardrobe"),
    ).toEqual([]);
    expect(
      validateOptionComposition(
        [{ ...outfit(), status: "unavailable", items: [] }],
        [],
        [],
        "from_wardrobe",
      ),
    ).toEqual([]);
  });
  it("rejects fabricated IDs, candidates and duplicated physical items", () => {
    const candidate = outfit();
    candidate.items[0].wardrobeItemId = "91fc631a-4211-44be-9ab3-af582fa579c2";
    expect(
      validateOptionComposition([candidate], [], inventory, "from_wardrobe"),
    ).toContain("invalid_owned_reference");
    expect(
      validateOptionComposition(
        [outfit()],
        [],
        inventory.map((item) => ({
          ...item,
          inventoryStatus: "saved_candidate",
        })),
        "from_wardrobe",
      ),
    ).toContain("invalid_owned_reference");
    const duplicate = outfit();
    duplicate.items.push({ ...duplicate.items[0], slotId: "top_2" });
    expect(
      validateOptionComposition([duplicate], [], inventory, "from_wardrobe"),
    ).toContain("duplicate_physical_item");
  });
  it("requires the fixed types and real composition differences", () => {
    expect(validateOptionComposition([outfit()], [], inventory)).toContain(
      "option_types_invalid",
    );
    expect(
      validateOptionComposition(
        [
          outfit(),
          { ...outfit(), optionType: "closest" },
          { ...outfit(), optionType: "fresh_alternative" },
        ],
        [],
        inventory,
      ),
    ).toContain("duplicate_composition");
  });
  it("allows archived owned slots in combined mode and keeps legacy exclusion", () => {
    const archived = inventory.map((item) => ({
      ...item,
      archivedAt: "2026-11-07T00:00:00Z",
    }));
    expect(
      validateOptionComposition([outfit()], [], archived, "from_wardrobe", {
        preferences: {},
        occasion: null,
        inventoryMode: "combined",
      }),
    ).toEqual([]);
    expect(
      validateOptionComposition([outfit()], [], archived, "from_wardrobe"),
    ).toContain("invalid_owned_reference");
    expect(
      validateOptionComposition(
        [{ ...outfit(), status: "unavailable", items: [] }],
        [],
        archived,
        "from_wardrobe",
        {
          preferences: {},
          occasion: null,
          inventoryMode: "combined",
        },
      ),
    ).toContain("wardrobe_direction_incorrectly_unavailable");
  });

  it("never accepts a saved candidate in an owned slot in any combined direction", () => {
    const candidates = inventory.map((item) => ({
      ...item,
      inventoryStatus: "saved_candidate",
    }));
    for (const optionType of [
      "closest",
      "from_wardrobe",
      "fresh_alternative",
    ] as const) {
      expect(
        validateOptionComposition(
          [{ ...outfit(), optionType }],
          [],
          candidates,
          optionType,
          {
            preferences: {},
            occasion: null,
            inventoryMode: "combined",
          },
        ),
      ).toContain("invalid_owned_reference");
    }
    expect(
      validateOptionComposition(
        [{ ...outfit(), status: "unavailable", items: [] }],
        [],
        candidates,
        "from_wardrobe",
        {
          preferences: {},
          occasion: null,
          inventoryMode: "combined",
        },
      ),
    ).toEqual([]);
  });
  it("rejects incomplete clothing coverage and missing slots in the owned direction", () => {
    const incomplete = outfit();
    incomplete.items.pop();
    expect(
      validateOptionComposition([incomplete], [], inventory, "from_wardrobe"),
    ).toContain("incomplete_clothing_coverage");
    const missing = outfit();
    missing.items[0].itemKind = "missing";
    missing.items[0].wardrobeItemId = null;
    expect(
      validateOptionComposition([missing], [], inventory, "from_wardrobe"),
    ).toContain("wardrobe_direction_contains_missing");
  });
});
