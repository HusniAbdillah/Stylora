import { describe, expect, it } from "vitest";
import { EMPTY_CAPSULE_DRAFT } from "./capsule-types";
import { capsuleBriefReady, type CapsuleDraftState } from "./schema";
import {
  canApplyPreparation,
  capsuleAutoReady,
  preparationBaseline,
} from "./draft-preparation";
import type { CapsuleItem } from "./capsule-types";

const id = "10000000-0000-4000-8000-000000000001";
const captured: CapsuleDraftState = {
  id,
  revision: 4,
  step: 3,
  visited: 3,
  brief: {
    ...EMPTY_CAPSULE_DRAFT,
    includedItemIds: [id],
    weather: "Mild",
    palette: "Warm neutrals",
    dressCode: "Casual",
    activities: ["City walks"],
  },
};
const receipt = { capsuleId: id, capsuleRevision: 1, draftRevision: 5 };

describe("capsule preparation receipts", () => {
  it("keeps newer local edits while using the acknowledged server CAS baseline", () => {
    const latest = {
      ...captured,
      brief: { ...captured.brief, notes: "Keep this newer edit" },
    };
    expect(canApplyPreparation(latest, captured, receipt, true)).toBe(false);
    expect(canApplyPreparation(latest, captured, receipt, false)).toBe(false);
    expect(preparationBaseline(latest, receipt)).toEqual({
      revision: 5,
      capsuleId: id,
      capsuleRevision: 1,
    });
    expect(latest.brief.notes).toBe("Keep this newer edit");
  });
  it("accepts its own unchanged receipt and rejects a stale or foreign draft", () => {
    expect(canApplyPreparation(captured, captured, receipt, false)).toBe(true);
    const newer = {
      ...captured,
      revision: 7,
      capsuleId: id,
      capsuleRevision: 2,
    };
    expect(canApplyPreparation(newer, captured, receipt, false)).toBe(false);
    expect(preparationBaseline(newer, receipt).revision).toBe(7);
    expect(
      canApplyPreparation(
        { ...captured, id: "20000000-0000-4000-8000-000000000001" },
        captured,
        receipt,
        false,
      ),
    ).toBe(false);
  });
  it("requires the complete brief before automatic preparation", () => {
    expect(capsuleBriefReady(EMPTY_CAPSULE_DRAFT)).toBe(false);
    expect(capsuleBriefReady(captured.brief)).toBe(true);
    const inventory: CapsuleItem[] = ["top", "bottom", "shoes"].map(
      (category, index) => ({
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        name: "Fixture piece",
        category: category as CapsuleItem["category"],
        inventoryStatus: "owned",
      }),
    );
    expect(capsuleAutoReady(captured.brief, inventory)).toBe(false);
    const complete = {
      ...captured.brief,
      includedItemIds: inventory.map((item) => item.id),
    };
    expect(capsuleAutoReady(complete, inventory)).toBe(true);
    expect(
      capsuleAutoReady({ ...complete, excludedItemIds: [id] }, inventory),
    ).toBe(false);
    expect(
      capsuleAutoReady(
        complete,
        inventory.map((item) => ({
          ...item,
          inventoryStatus: "saved_candidate",
        })),
      ),
    ).toBe(false);
  });
});
