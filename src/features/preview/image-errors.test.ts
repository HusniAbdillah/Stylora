import { describe, expect, it } from "vitest";
import { avatarIoError } from "./image-errors";

describe("avatar Storage failures", () => {
  it.each([
    [0, "PROVIDER_NETWORK_ERROR"],
    [408, "PROVIDER_TIMEOUT"],
    [429, "PROVIDER_RATE_LIMITED"],
    [500, "PROVIDER_SERVER_ERROR"],
    [502, "PROVIDER_SERVER_ERROR"],
    [503, "PROVIDER_SERVER_ERROR"],
    [504, "PROVIDER_SERVER_ERROR"],
  ])(
    "keeps a transient upstream status %i eligible for bounded retry",
    (status, code) => {
      const failure = avatarIoError(
        { code: "", status },
        "AVATAR_IMAGE_UPLOAD_FAILED",
      );
      expect(failure).toMatchObject({ code, retryable: true });
    },
  );

  it.each([400, 401, 403, 404, 409, 422, 501])(
    "keeps upstream status %i terminal",
    (status) => {
      expect(
        avatarIoError({ status }, "AVATAR_IMAGE_UPLOAD_FAILED").retryable,
      ).toBe(false);
    },
  );

  it("uses explicit shared Storage metadata without class imports", () => {
    expect(
      avatarIoError(
        {
          name: "StorageAssetError",
          code: "STORAGE_DOWNLOAD_FAILED",
          upstreamStatus: 503,
          retryable: true,
        },
        "AVATAR_IMAGE_UNAVAILABLE",
      ),
    ).toMatchObject({ code: "PROVIDER_SERVER_ERROR", retryable: true });
    expect(
      avatarIoError(
        {
          code: "STORAGE_DOWNLOAD_FAILED",
          upstreamStatus: 503,
          retryable: false,
        },
        "AVATAR_IMAGE_UNAVAILABLE",
      ),
    ).toMatchObject({ code: "STORAGE_DOWNLOAD_FAILED", retryable: false });
  });

  it("preserves validation and denied access even with inconsistent retry metadata", () => {
    for (const code of [
      "INVALID_STORAGE_ASSET",
      "INVALID_STORAGE_UPLOAD",
      "STORAGE_IMAGE_INVALID",
      "42501",
    ]) {
      expect(
        avatarIoError(
          { code, upstreamStatus: 503, retryable: true },
          "AVATAR_IMAGE_UNAVAILABLE",
        ).retryable,
      ).toBe(false);
    }
    expect(
      avatarIoError(
        { upstreamStatus: 403, retryable: true },
        "AVATAR_IMAGE_UNAVAILABLE",
      ).retryable,
    ).toBe(false);
  });

  it("recognizes transport failures without trusting an error message", () => {
    expect(
      avatarIoError(
        {
          name: "StorageUnknownError",
          originalError: new TypeError("fetch failed"),
        },
        "AVATAR_IMAGE_UNAVAILABLE",
      ),
    ).toMatchObject({ code: "PROVIDER_NETWORK_ERROR", retryable: true });
    expect(
      avatarIoError(new Error("fetch failed"), "AVATAR_IMAGE_UNAVAILABLE")
        .retryable,
    ).toBe(false);
  });
});
