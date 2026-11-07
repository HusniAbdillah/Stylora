import { describe, expect, it } from "vitest";
import { preferencesToStorage } from "@/features/preferences/schema";
import {
  avatarVisualDirectionSchema,
  buildAvatarVisualDirection,
  type AvatarVisualItem,
} from "./visual-direction";

const item = (
  category: string,
  subcategory: string | null = null,
  attributes = {},
): AvatarVisualItem => ({ category, subcategory, attributes });
const choices = {
  skinSwatchId: "depth_03" as const,
  skinSwatchHex: "#cfa080",
  undertone: "warm" as const,
  bodyIllustrationGroup: "women" as const,
  bodyIllustrationId: "pear" as const,
  proportions: [" Long  torso ", "Long torso"],
  fit: "relaxed" as const,
  contrast: "medium" as const,
  styles: ["smart_tailoring", "relaxed_minimal"],
  colorFamilies: ["Warm neutrals"],
  occasions: ["Work"],
  climate: ["Mild"],
  coverage: ["Covered shoulders"],
  lengths: ["Full length"],
  layering: ["Light layers"],
  fabricDislikes: ["Wool"],
  footwearComfort: ["Walkable flats"],
  careTolerance: ["Low care"],
};
const snapshot = {
  revision: 2,
  ...preferencesToStorage(choices),
  style_notes: "User correction: keep sleeves loose.",
};

describe("avatar visual direction", () => {
  it.each([
    undefined,
    null,
    {},
    {
      revision: 1,
      style_dna: {},
      body_profile: {},
      fit_preferences: {},
      style_notes: "",
    },
    {
      undertone: "unknown",
      fit: "unsure",
      bodyIllustrationGroup: "men",
      coverage: ["No preference"],
    },
  ])(
    "does not invent a profile for empty or skipped preferences %#",
    (input) => {
      const result = buildAvatarVisualDirection(input, []);
      expect(result).toMatchObject({
        version: "visual-direction.v2",
        mode: "neutral",
        preferences: {},
        pose: { id: "standing-clear" },
      });
    },
  );

  it("retains every selected choice, catalog description and correction note", () => {
    const result = buildAvatarVisualDirection(snapshot, [item("top")]);
    expect(result.mode).toBe("personalized");
    expect(result.preferences).toEqual({
      skin: {
        swatchId: "depth_03",
        hex: "#CFA080",
        depthLabel: "Depth 3",
        undertone: "warm",
      },
      body: {
        group: "women",
        id: "pear",
        label: "Pear",
        description: "Hips wider than shoulders",
        proportions: ["Long torso"],
      },
      fit: "relaxed",
      contrast: "medium",
      styles: ["relaxed_minimal", "smart_tailoring"],
      colorFamilies: ["Warm neutrals"],
      occasions: ["Work"],
      climate: ["Mild"],
      coverage: ["Covered shoulders"],
      lengths: ["Full length"],
      layering: ["Light layers"],
      fabricDislikes: ["Wool"],
      footwearComfort: ["Walkable flats"],
      careTolerance: ["Low care"],
      notes: snapshot.style_notes,
    });
    expect(result.preferences).not.toHaveProperty("revision");
    expect(avatarVisualDirectionSchema.parse(result)).toEqual(result);
  });

  it("preserves sparse visual choices without filling other dimensions", () => {
    expect(
      buildAvatarVisualDirection(
        { undertone: "olive", proportions: ["Long legs"] },
        [],
      ).preferences,
    ).toEqual({
      skin: { undertone: "olive" },
      body: { proportions: ["Long legs"] },
    });
    expect(
      buildAvatarVisualDirection({ fit: "fitted" }, []).preferences,
    ).toEqual({ fit: "fitted" });
  });

  it("retains context and notes without interpreting a human profile", () => {
    expect(
      buildAvatarVisualDirection(
        {
          style_dna: { occasions: ["Work"], climate: ["Mild"] },
          style_notes: "Keep the existing sleeve correction.",
        },
        [],
      ),
    ).toMatchObject({
      mode: "neutral",
      preferences: {
        occasions: ["Work"],
        climate: ["Mild"],
        notes: "Keep the existing sleeve correction.",
      },
    });
  });

  it.each([
    { skinSwatchId: "depth_03", skinSwatchHex: "#F1D4C2" },
    { skinSwatchId: "depth_03" },
    { skinSwatchHex: "#CFA080" },
    {
      style_dna: {
        skinSwatchId: "depth_03",
        skinSwatchHex: "#CFA080",
        skin_depth: "depth_01",
      },
    },
    { bodyIllustrationId: "pear" },
    { bodyIllustrationGroup: "women", bodyIllustrationId: "invented" },
  ])("rejects incomplete or conflicting visual identity %#", (input) => {
    expect(() => buildAvatarVisualDirection(input, [])).toThrow();
  });

  it("rejects unknown or conflicting corrections instead of dropping them", () => {
    expect(() =>
      buildAvatarVisualDirection(
        { style_dna: { fit: "regular" }, fit_preferences: { fit: "relaxed" } },
        [],
      ),
    ).toThrow();
    expect(() =>
      buildAvatarVisualDirection(
        { body_profile: { inferredGender: "woman" } },
        [],
      ),
    ).toThrow();
    expect(() =>
      buildAvatarVisualDirection(
        { style_notes: "First", styleNotes: "Corrected" },
        [],
      ),
    ).toThrow();
  });

  it("normalizes legacy saved envelopes independently of revision and ordering", () => {
    const legacy = {
      revision: 99,
      styleDna: snapshot.style_dna,
      bodyProfile: snapshot.body_profile,
      fitPreferences: snapshot.fit_preferences,
      styleNotes: snapshot.style_notes,
    };
    expect(
      buildAvatarVisualDirection(legacy, [item("top"), item("bottom")]),
    ).toEqual(
      buildAvatarVisualDirection(snapshot, [item("bottom"), item("top")]),
    );
    const alias = {
      style_dna: { skin_depth: "depth_03", skinSwatchHex: "#cfa080" },
    };
    expect(buildAvatarVisualDirection(alias, []).preferences.skin).toEqual({
      swatchId: "depth_03",
      hex: "#CFA080",
      depthLabel: "Depth 3",
    });
  });

  it.each([
    [[item("top"), item("bottom")], "standing-clear"],
    [[item("outerwear", "coat")], "three-quarter-outerwear"],
    [[item("dress")], "standing-dress"],
    [[item("accessory", "messenger")], "three-quarter-bag"],
    [[item("accessory", null, { bagType: "tote" })], "standing-accessories"],
    [
      [item("accessory", "belt", { bagType: "Not applicable" })],
      "standing-accessories",
    ],
  ] as const)("selects a deterministic standing pose %#", (items, expected) => {
    const result = buildAvatarVisualDirection({}, items);
    expect(result.pose.id).toBe(expected);
    expect(buildAvatarVisualDirection({}, [...items].reverse())).toEqual(
      result,
    );
    expect(result.pose.instructions).toMatch(/hands/i);
  });

  it("keeps bags readable with layered outfits and validates manifest identity", () => {
    const result = buildAvatarVisualDirection({}, [
      item("outerwear"),
      item("accessory", "tote"),
    ]);
    expect(result.pose.instructions).toContain("bag visible");
    expect(
      avatarVisualDirectionSchema.safeParse({ ...result, mode: "personalized" })
        .success,
    ).toBe(false);
    expect(
      avatarVisualDirectionSchema.safeParse({
        ...result,
        mode: "personalized",
        preferences: {
          skin: { swatchId: "depth_03", hex: "#F1D4C2", depthLabel: "Depth 3" },
        },
      }).success,
    ).toBe(false);
    expect(
      avatarVisualDirectionSchema.safeParse({
        ...result,
        pose: { id: result.pose.id, instructions: "Extreme jumping pose." },
      }).success,
    ).toBe(false);
  });

  it("marks shoes omitted for top and bottom without requesting footwear", () => {
    const result = buildAvatarVisualDirection({}, [
      item("top"),
      item("bottom"),
    ]);
    expect(result.composition).toEqual({
      selectedSlots: ["top", "bottom"],
      omittedSlots: ["dress", "outerwear", "shoes", "bags", "accessories"],
    });
    expect(result.pose.instructions).not.toMatch(/footwear|shoes/i);
    expect(
      buildAvatarVisualDirection({}, [item("dress")]).pose.instructions,
    ).not.toMatch(/footwear|shoes/i);
  });

  it("requests only selected footwear when shoes are chosen", () => {
    const result = buildAvatarVisualDirection({}, [
      item("top"),
      item("bottom"),
      item("shoes"),
    ]);
    expect(result.composition.selectedSlots).toEqual([
      "top",
      "bottom",
      "shoes",
    ]);
    expect(result.composition.omittedSlots).not.toContain("shoes");
    expect(result.pose.instructions).toContain("selected footwear");
    expect(
      buildAvatarVisualDirection({}, [item("dress"), item("shoes")]).pose
        .instructions,
    ).toContain("selected footwear");
  });

  it.each([
    "tote",
    "purse",
    "satchel",
    "duffel",
    "briefcase",
    "crossbody",
    "messenger",
    "clutch",
    "backpack",
    "handbag",
  ])("classifies %s using the Preview bag slot", (subcategory) => {
    const result = buildAvatarVisualDirection({}, [
      item("accessory", subcategory),
      item("accessory", "belt"),
    ]);
    expect(result.composition.selectedSlots).toEqual(["bags", "accessories"]);
    expect(result.composition.omittedSlots).toEqual([
      "top",
      "bottom",
      "dress",
      "outerwear",
      "shoes",
    ]);
  });

  it("does not invent a bag slot from attributes outside the Preview classifier", () => {
    const result = buildAvatarVisualDirection({}, [
      item("accessory", null, { bagType: "tote" }),
    ]);
    expect(result.composition.selectedSlots).toEqual(["accessories"]);
    expect(result.composition.omittedSlots).toContain("bags");
    expect(result.pose.instructions).not.toContain("bag");
  });

  it.each([
    {
      selectedSlots: ["top", "top", "bottom"],
      omittedSlots: ["dress", "outerwear", "shoes", "bags", "accessories"],
    },
    {
      selectedSlots: ["top", "bottom"],
      omittedSlots: ["dress", "outerwear", "top", "bags", "accessories"],
    },
    {
      selectedSlots: ["top", "bottom"],
      omittedSlots: ["dress", "outerwear", "bags", "accessories"],
    },
    {
      selectedSlots: ["top", "bottom", "socks"],
      omittedSlots: ["dress", "outerwear", "shoes", "bags", "accessories"],
    },
  ])(
    "rejects non-exhaustive, overlapping, duplicate or unsupported composition %#",
    (composition) => {
      const result = buildAvatarVisualDirection({}, [
        item("top"),
        item("bottom"),
      ]);
      expect(
        avatarVisualDirectionSchema.safeParse({ ...result, composition })
          .success,
      ).toBe(false);
    },
  );

  it("rejects unsupported categories and pose directions for unselected slots", () => {
    expect(() => buildAvatarVisualDirection({}, [item("socks")])).toThrow();
    expect(() =>
      buildAvatarVisualDirection({}, [item("bags", "tote")]),
    ).toThrow();
    const result = buildAvatarVisualDirection({}, [
      item("top"),
      item("bottom"),
    ]);
    const bagPose = buildAvatarVisualDirection({}, [
      item("accessory", "tote"),
    ]).pose;
    expect(
      avatarVisualDirectionSchema.safeParse({ ...result, pose: bagPose })
        .success,
    ).toBe(false);
    expect(
      avatarVisualDirectionSchema.safeParse({
        ...result,
        version: "visual-direction.v1",
      }).success,
    ).toBe(false);
  });
});
