import { describe, expect, it } from "vitest";
import { changeField, intakeFields } from "./client";
import type { ItemValues } from "./schema";

const shirt: ItemValues = {
  name: "Striped polo shirt",
  category: "top",
  subcategory: "Polo shirt",
  description: "A short-sleeve polo shirt with horizontal stripes.",
  attributes: {
    primaryColor: "Dark brown",
    secondaryColors: ["Muted rose", "Pale gray"],
    pattern: "Horizontal stripes",
    fit: "Shaped with slight ease",
    sleeve: "Short sleeves",
    logoPresence: "Small chest mark",
  },
};

describe("Wardrobe intake field projection", () => {
  it("keeps the actual primary and secondary colors and extra observations", () => {
    const before = structuredClone(shirt);
    const fields = intakeFields(shirt, undefined, shirt);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "attributes.primaryColor",
          label: "Primary Color",
          value: "Dark brown",
        }),
        expect.objectContaining({
          key: "attributes.secondaryColors",
          value: "Muted rose, Pale gray",
        }),
        expect.objectContaining({
          key: "attributes.logoPresence",
          value: "Small chest mark",
        }),
        expect.objectContaining({
          key: "description",
          value: shirt.description,
        }),
        expect.objectContaining({ key: "subcategory", value: "Polo shirt" }),
      ]),
    );
    expect(fields.some((field) => field.key === "attributes.colors")).toBe(
      false,
    );
    expect(fields.every((field) => field.value.trim())).toBe(true);
    const edited = changeField(
      changeField(shirt, "attributes.fit", "Relaxed"),
      "attributes.secondaryColors",
      "Muted rose, White",
    );
    expect(edited.attributes).toMatchObject({
      ...shirt.attributes,
      fit: "Relaxed",
      secondaryColors: ["Muted rose", "White"],
    });
    expect(shirt).toEqual(before);
  });

  it("shows necklace observations without adding empty apparel fields", () => {
    const necklace: ItemValues = {
      ...shirt,
      name: "Stone pendant necklace",
      category: "accessory",
      subcategory: "Pendant necklace",
      attributes: {
        metalAppearance: "Bright silver-tone",
        stoneAppearance: "Clear faceted stones",
        shape: "Rectangular pendant",
        scale: "Statement",
        surfaceFinish: "Polished",
      },
    };
    const fields = intakeFields(necklace, undefined, necklace);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "attributes.metalAppearance",
          value: "Bright silver-tone",
        }),
        expect.objectContaining({
          key: "attributes.stoneAppearance",
          value: "Clear faceted stones",
        }),
        expect.objectContaining({
          key: "attributes.surfaceFinish",
          value: "Polished",
        }),
      ]),
    );
    expect(
      fields.some((field) =>
        [
          "attributes.fit",
          "attributes.sleeve",
          "attributes.neckline",
          "attributes.apparentMaterial",
        ].includes(field.key),
      ),
    ).toBe(false);
    const cleared = changeField(necklace, "attributes.metalAppearance", "");
    expect(
      intakeFields(cleared, undefined, necklace).find(
        (field) => field.key === "attributes.metalAppearance",
      )?.value,
    ).toBe("");
  });

  it("offers relevant empty manual controls and keeps them while typing", () => {
    const manual: ItemValues = {
      ...shirt,
      category: "shoes",
      subcategory: null,
      attributes: {},
    };
    const keys = intakeFields(manual).map((field) => field.key);
    expect(keys).toContain("attributes.toeShape");
    expect(keys).toContain("attributes.heelType");
    expect(keys).not.toContain("attributes.sleeve");
    expect(keys).not.toContain("attributes.rise");
    const changed = changeField(manual, "attributes.primaryColor", "Black");
    expect(intakeFields(changed).map((field) => field.key)).toEqual(keys);

    const jewelryKeys = intakeFields({
      ...manual,
      category: "accessory",
      subcategory: "Pendant necklace",
    }).map((field) => field.key);
    expect(jewelryKeys).toContain("attributes.metalAppearance");
    expect(jewelryKeys).toContain("attributes.stoneAppearance");
    expect(jewelryKeys).not.toContain("attributes.sleeve");
    expect(jewelryKeys).not.toContain("attributes.fit");
  });
});
