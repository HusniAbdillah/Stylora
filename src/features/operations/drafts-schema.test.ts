import { describe, expect, it } from "vitest";
import {
  availableCreateSteps,
  createDraftSchema,
  parseDraftPayload,
  patchDraftSchema,
} from "./drafts-schema";

describe("workflow drafts", () => {
  it("preserves incomplete preference and profile input while rejecting hidden fields", () => {
    expect(parseDraftPayload("profile", { displayName: "  A name " })).toEqual({
      displayName: "  A name ",
    });
    expect(
      parseDraftPayload("preferences", {
        skinSwatchId: "depth_01",
        undertone: null,
      }),
    ).toEqual({ skinSwatchId: "depth_01", undertone: null });
    expect(() =>
      parseDraftPayload("preferences", { workspaceId: "foreign" }),
    ).toThrow();
    expect(() => parseDraftPayload("profile", { role: "admin" })).toThrow();
  });

  it("limits creation to the supported feature contract and scoped reference fields", () => {
    expect(
      createDraftSchema.safeParse({ featureKind: "inspiration", payload: {} })
        .success,
    ).toBe(true);
    expect(
      createDraftSchema.safeParse({ featureKind: "preview" }).success,
    ).toBe(false);
    expect(
      createDraftSchema.safeParse({
        featureKind: "profile",
        workspaceId: "foreign",
      }).success,
    ).toBe(false);
    expect(
      createDraftSchema.safeParse({
        featureKind: "preferences",
        lookId: "cccf56bf-ac67-417e-bef1-f43dc6a87aa1",
      }).success,
    ).toBe(false);
    expect(
      patchDraftSchema.safeParse({
        expectedRevision: 1,
        visitedSteps: ["upload", "upload"],
      }).success,
    ).toBe(false);
    expect(patchDraftSchema.safeParse({ expectedRevision: 0 }).success).toBe(
      false,
    );
  });

  it("unlocks forward navigation only after the relevant persisted result", () => {
    expect(availableCreateSteps(false, null)).toEqual(["upload"]);
    expect(availableCreateSteps(true, "draft")).toEqual(["upload", "review"]);
    expect(availableCreateSteps(true, "reviewed")).toEqual([
      "upload",
      "review",
      "matches",
    ]);
    expect(availableCreateSteps(true, "matched")).toEqual([
      "upload",
      "review",
      "matches",
      "ideas",
    ]);
    expect(availableCreateSteps(true, "options_ready")).toEqual([
      "upload",
      "review",
      "matches",
      "ideas",
      "details",
    ]);
  });
});
