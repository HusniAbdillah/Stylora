import { describe, expect, it } from "vitest";
import {
  previewSelectionSchema,
  slotForPreviewItem,
  validatePreviewSelection,
} from "./schema";

const id = "00000000-0000-4000-8000-000000000001";

describe("Preview selection integrity", () => {
  it("rejects one garment repeated across slots", () => {
    expect(
      previewSelectionSchema.safeParse({ bags: id, accessories: id }).success,
    ).toBe(false);
  });

  it("rejects candidates and a garment in the wrong slot", () => {
    const item = {
      id,
      name: "White shirt",
      category: "top" as const,
      inventoryStatus: "saved_candidate" as const,
    };
    expect(validatePreviewSelection({ top: id }, [item])).toBe(false);
    expect(
      validatePreviewSelection({ bottom: id }, [
        { ...item, inventoryStatus: "owned" },
      ]),
    ).toBe(false);
  });

  it("maps bags separately from other accessory roles", () => {
    expect(
      slotForPreviewItem({
        category: "accessory",
        subcategory: "crossbody purse",
      }),
    ).toBe("bags");
    expect(
      slotForPreviewItem({ category: "accessory", subcategory: "belt" }),
    ).toBe("accessories");
  });
});
