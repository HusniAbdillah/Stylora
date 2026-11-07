import { describe, expect, it } from "vitest";
import { isCurrentPreviewResponse } from "./request-context";

describe("Preview response fencing", () => {
  const requested = {
    draftId: "draft",
    revision: 3,
    preferenceRevision: 4,
    epoch: 0,
    renderFingerprint: "current-context",
  };
  const response = { draftId: "draft", revision: 3, preferenceRevision: 4 };
  it("rejects an in-flight response after render quality or manifest changes", () => {
    expect(
      isCurrentPreviewResponse(
        { ...requested, renderFingerprint: "new-quality-or-manifest" },
        requested,
        response,
      ),
    ).toBe(false);
  });
  it("accepts the current context and rejects responses from an earlier preference or navigation check", () => {
    expect(isCurrentPreviewResponse(requested, requested, response)).toBe(true);
    expect(
      isCurrentPreviewResponse(
        { ...requested, preferenceRevision: 5 },
        requested,
        response,
      ),
    ).toBe(false);
    expect(
      isCurrentPreviewResponse({ ...requested, epoch: 1 }, requested, response),
    ).toBe(false);
    expect(
      isCurrentPreviewResponse(requested, requested, {
        ...response,
        preferenceRevision: 3,
      }),
    ).toBe(false);
    expect(
      isCurrentPreviewResponse(
        { ...requested, draftId: "other" },
        requested,
        response,
      ),
    ).toBe(false);
  });
  it("accepts an advanced render revision only for the current render request", () => {
    const current = { ...requested, revision: 4 };
    expect(
      isCurrentPreviewResponse(
        current,
        requested,
        { ...response, revision: 4, renderRequestId: "new" },
        "new",
      ),
    ).toBe(true);
    expect(
      isCurrentPreviewResponse(
        current,
        requested,
        { ...response, revision: 4, renderRequestId: "old" },
        "new",
      ),
    ).toBe(false);
    expect(
      isCurrentPreviewResponse(requested, requested, {
        ...response,
        revision: 2,
      }),
    ).toBe(false);
  });
});
