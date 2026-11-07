import { describe, expect, it } from "vitest";
import { isCurrentPreviewContext, previewJobStatus } from "./job-status";
import {
  previewSelectionSchema,
  slotForPreviewItem,
  validatePreviewSelection,
} from "./schema";

const id = "00000000-0000-4000-8000-000000000001";

describe("Preview selection integrity", () => {
  it("invalidates image context when preferences, render settings or prompt versions change", () => {
    const operation = {
      input: { renderFingerprint: "captured" },
      prompt_version: "avatar-v1",
      model: "image-model",
    };
    const current = {
      renderFingerprint: "captured",
      promptVersion: "avatar-v1",
      model: "image-model",
    };
    expect(isCurrentPreviewContext(operation, current)).toBe(true);
    expect(
      isCurrentPreviewContext(operation, {
        ...current,
        renderFingerprint: "new-settings-or-preferences",
      }),
    ).toBe(false);
    expect(
      isCurrentPreviewContext(operation, {
        ...current,
        promptVersion: "avatar-v2",
      }),
    ).toBe(false);
    expect(
      isCurrentPreviewContext(operation, { ...current, model: "new-model" }),
    ).toBe(false);
    expect(isCurrentPreviewContext({ ...operation, input: {} }, current)).toBe(
      false,
    );
    expect(
      isCurrentPreviewContext(
        { ...operation, prompt_version: null, model: null },
        current,
      ),
    ).toBe(false);
  });
  it("restarts superseded inputs while keeping cancellation stopped", () => {
    expect(previewJobStatus("superseded")).toBe("idle");
    expect(previewJobStatus("cancelled")).toBe("cancelled");
    expect(previewJobStatus("partial")).toBe("running");
    expect(previewJobStatus("unknown")).toBe("failed");
  });
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
