import { describe, expect, it } from "vitest";
import {
  normalizePreferences,
  preferencesDraftSchema,
  preferencesFingerprint,
  preferencesSchema,
  preferencesToStorage,
  savePreferencesSchema,
} from "./schema";

describe("preference contract", () => {
  it("retains incomplete drafts but validates saved swatch and body pairs", () => {
    expect(
      preferencesDraftSchema.safeParse({
        skinSwatchId: "depth_02",
        proportions: ["Long  torso "],
      }).success,
    ).toBe(true);
    expect(
      preferencesSchema.safeParse({ skinSwatchId: "depth_02" }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({
        skinSwatchId: "depth_02",
        skinSwatchHex: "#F1D4C2",
      }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ bodyIllustrationId: "pear" }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({
        bodyIllustrationId: "pear",
        bodyIllustrationGroup: "men",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown keys, invalid selections, and unbounded nested input", () => {
    expect(preferencesSchema.safeParse({ gender: "inferred" }).success).toBe(
      false,
    );
    expect(preferencesSchema.safeParse({ fit: "invented" }).success).toBe(
      false,
    );
    expect(
      preferencesSchema.safeParse({ climate: [{ arbitrary: true }] }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({ climate: Array(17).fill("Hot") }).success,
    ).toBe(false);
    expect(
      savePreferencesSchema.safeParse({ expectedRevision: 0, preferences: {} })
        .success,
    ).toBe(false);
    expect(
      savePreferencesSchema.safeParse({
        expectedRevision: 1,
        preferences: {},
        workspaceId: "foreign",
      }).success,
    ).toBe(false);
  });

  it("normalizes only selected facts and keeps swatch identity explicit", () => {
    const selected = preferencesSchema.parse({
      skinSwatchId: "depth_03",
      skinSwatchHex: "#cfa080",
      undertone: "unsure",
      coverage: ["No preference"],
      proportions: [" Long  torso ", "Long torso"],
      bodyIllustrationGroup: "women",
    });
    expect(normalizePreferences(selected)).toEqual({
      proportions: ["Long torso"],
      skinSwatchHex: "#CFA080",
      skinSwatchId: "depth_03",
      skin_depth: "depth_03",
    });
    expect(
      normalizePreferences({ undertone: "unknown", fit: null, styles: [] }),
    ).toEqual({});
  });

  it("fingerprints effective styling choices independently of ordering or skipped values", () => {
    expect(
      preferencesFingerprint({
        climate: ["Mild", "Hot and humid"],
        undertone: "unsure",
      }),
    ).toBe(preferencesFingerprint({ climate: ["Hot and humid", "Mild"] }));
    expect(preferencesFingerprint({ undertone: "warm" })).not.toBe(
      preferencesFingerprint({ undertone: "cool" }),
    );
  });

  it("maps saved selections to their storage fields without profile ownership claims", () => {
    expect(
      preferencesToStorage({
        skinSwatchId: "depth_01",
        skinSwatchHex: "#F1D4C2",
        fit: "relaxed",
        bodyIllustrationGroup: "women",
        bodyIllustrationId: "rectangle",
      }),
    ).toEqual({
      style_dna: {
        skinSwatchId: "depth_01",
        skinSwatchHex: "#F1D4C2",
        skin_depth: "depth_01",
      },
      fit_preferences: { fit: "relaxed" },
      body_profile: {
        bodyIllustrationGroup: "women",
        bodyIllustrationId: "rectangle",
      },
    });
  });
});
