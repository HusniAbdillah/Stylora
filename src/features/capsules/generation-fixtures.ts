import { attributesSchema } from "@/lib/ai/fashion-schema";
import { EMPTY_CAPSULE_DRAFT } from "./capsule-types";
import { capsuleBriefSchema } from "./schema";

export const capsuleFixtureIds = [1, 2, 3, 4, 5].map(
  (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
);
export const capsuleFixtureItems = capsuleFixtureIds.map((id, index) => ({
  id,
  name: `Fixture ${index}`,
  category: (index < 2 ? "top" : index < 4 ? "bottom" : "shoes") as
    "top" | "bottom" | "shoes",
  subcategory: index < 2 ? "shirt" : index < 4 ? "trousers" : "sneakers",
  description: "Synthetic owned garment for unit tests.",
  revision: 1,
  attributes: attributesSchema.parse({ primaryColor: "blue" }),
  inferred_attributes: {},
  corrections: {},
  provenance: {},
}));
export const capsuleFixtureBrief = capsuleBriefSchema.parse({
  ...EMPTY_CAPSULE_DRAFT,
  targetOutfits: 3,
  weather: "Mild",
  activities: ["City walks"],
  palette: "Warm neutrals",
  dressCode: "Casual",
  includedItemIds: capsuleFixtureIds,
  requiredItemIds: [capsuleFixtureIds[0]],
});
export function capsuleOutputFixture() {
  const ids = capsuleFixtureIds;
  return {
    outfits: [
      [ids[0], ids[2], ids[4]],
      [ids[1], ids[2], ids[4]],
      [ids[0], ids[3], ids[4]],
    ].map((itemIds) => ({
      title: "Fixture outfit",
      occasion: "City walks",
      itemIds,
      additionKeys: [] as string[],
      summary: "Fixture composition.",
      whyThis: [
        {
          reason: "The pieces share a palette.",
          evidenceItemIds: itemIds.slice(0, 2),
        },
        { reason: "The shoes complete the outfit.", evidenceItemIds: [ids[4]] },
      ],
      inputsUsed: ["Owned wardrobe"],
      differences: [] as string[],
      uncertainty: ["Fabric composition is unverified."],
    })),
    additions: [],
  };
}
