import { describe, expect, it } from "vitest";
import { preferencesReturnHref } from "./return-href";

const id = "0913da75-d639-4a78-849b-a0d37553c837";

describe("preferences return destinations", () => {
  it("retains the exact preview draft and active category", () => {
    expect(
      preferencesReturnHref(
        `/preview?draftId=${id}&category=shoes&next=https://example.com#ignored`,
      ),
    ).toBe(`/preview?draftId=${id}&category=shoes`);
    expect(preferencesReturnHref("/preview?category=bags")).toBe(
      "/preview?category=bags",
    );
    expect(preferencesReturnHref("/preview?draftId=invalid")).toBeNull();
  });
  it("preserves Create drafts and outfit option coordinates", () => {
    expect(preferencesReturnHref(`/create?draft=${id}`)).toBe(
      `/create?draft=${id}`,
    );
    expect(preferencesReturnHref(`/create/${id}?draft=${id}&step=review`)).toBe(
      `/create/${id}?draft=${id}&step=review`,
    );
    expect(
      preferencesReturnHref(
        `/looks/${id}?option_id=${id}&draft=${id}&step=details`,
      ),
    ).toBe(`/looks/${id}?draft=${id}&option_id=${id}&step=details`);
  });
  it.each([
    "https://example.com/preview",
    "//example.com/preview",
    "/\\example.com/preview",
    "/preview\n",
    "/preferences",
    "/looks/not-a-uuid",
    "/api/preferences",
  ])("rejects unsafe or unrelated destination %s", (destination) => {
    expect(preferencesReturnHref(destination)).toBeNull();
  });
});
