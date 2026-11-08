import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/ai/openai", () => ({
  IMAGE_MODEL: "gpt-image-1.5",
  AVATAR_PROMPT_VERSION: "stylora-fashion-v1.avatar-3.fixture",
  FASHION_PROMPT_VERSION: "stylora-fashion-v1.openai-2.fixture",
  FASHION_SCHEMA_VERSION: "fashion-item.v1",
  FASHION_KNOWLEDGE_VERSION: "fixture-knowledge",
  generateFashionImage: vi.fn(() => {
    throw new Error("Provider access is forbidden in fingerprint tests.");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: vi.fn(() => {
    throw new Error("Database access is forbidden in fingerprint tests.");
  }),
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  createWorkspaceSignedUpload: vi.fn(),
  verifyWorkspaceStorageAsset: vi.fn(),
  readVerifiedWorkspaceStorageAsset: vi.fn(),
}));
vi.mock("./visual-direction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./visual-direction")>();
  return {
    ...actual,
    buildAvatarVisualDirection: vi.fn(actual.buildAvatarVisualDirection),
  };
});

import {
  avatarRenderFingerprint,
  getAvatarRenderSettings,
  restoreAvatarCheckpoint,
  type AvatarItem,
} from "./image";
import { buildAvatarVisualDirection } from "./visual-direction";
import { readVerifiedWorkspaceStorageAsset } from "@/lib/supabase/storage";

afterEach(() => vi.clearAllMocks());
const shirt: AvatarItem = {
  id: "d270f645-b0d9-4c6f-8593-a154f31b98c9",
  name: "Sample blue shirt",
  category: "top",
  subcategory: "shirt",
  description: "Sample blue cotton shirt.",
  attributes: { primaryColor: "blue", fit: "regular" },
  revision: 1,
  asset_id: "ae781e34-b315-44a5-abfe-0c6c074a49c8",
};
const trousers: AvatarItem = {
  ...shirt,
  id: "27521082-6561-47ac-a732-ae19901b7849",
  name: "Sample trousers",
  category: "bottom",
  subcategory: "trousers",
  description: "Sample straight trousers.",
};
const outfit = [shirt, trousers];
const preferences = {
  revision: 1,
  style_dna: {
    skinSwatchId: "depth_03",
    skinSwatchHex: "#cfa080",
    skin_depth: "depth_03",
    undertone: "warm",
    styles: ["smart_tailoring", "relaxed_minimal"],
  },
  body_profile: {
    bodyIllustrationGroup: "women",
    bodyIllustrationId: "pear",
    proportions: ["Long torso", "Long legs"],
  },
  fit_preferences: { fit: "relaxed" },
  style_notes: "Keep the supplied sleeve correction.",
};
const settings = getAvatarRenderSettings({});

describe("avatar render fingerprints", () => {
  it("reuses equivalent raw and legacy snapshots across revision and ordering changes", () => {
    const legacy = {
      revision: 99,
      fitPreferences: preferences.fit_preferences,
      bodyProfile: {
        ...preferences.body_profile,
        proportions: ["Long legs", "Long torso"],
      },
      styleDna: {
        styles: ["relaxed_minimal", "smart_tailoring"],
        undertone: "warm",
        skin_depth: "depth_03",
        skinSwatchHex: "#CFA080",
        skinSwatchId: "depth_03",
      },
      styleNotes: preferences.style_notes,
    };
    const first = avatarRenderFingerprint(outfit, preferences, settings);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(
      avatarRenderFingerprint([...outfit].reverse(), legacy, settings),
    ).toBe(first);
    expect(
      avatarRenderFingerprint(
        outfit,
        { ...preferences, revision: 2 },
        settings,
      ),
    ).toBe(first);
  });

  it.each([
    [
      "swatch",
      {
        ...preferences,
        style_dna: {
          ...preferences.style_dna,
          skinSwatchId: "depth_04",
          skinSwatchHex: "#B9805D",
          skin_depth: "depth_04",
        },
      },
    ],
    [
      "body",
      {
        ...preferences,
        body_profile: {
          ...preferences.body_profile,
          bodyIllustrationGroup: "men",
          bodyIllustrationId: "rectangle",
        },
      },
    ],
    ["fit", { ...preferences, fit_preferences: { fit: "fitted" } }],
    [
      "correction note",
      {
        ...preferences,
        style_notes: "Updated correction: preserve extra sleeve room.",
      },
    ],
  ])("invalidates when the supplied %s changes", (_name, changed) => {
    expect(avatarRenderFingerprint(outfit, changed, settings)).not.toBe(
      avatarRenderFingerprint(outfit, preferences, settings),
    );
  });

  it("uses the deterministic pose for the selected outfit composition", () => {
    const layered = [
      ...outfit,
      {
        ...shirt,
        id: "e76c4e28-79f8-4f4c-8bbd-61b44504ae26",
        category: "outerwear" as const,
        subcategory: "coat",
      },
    ];
    expect(buildAvatarVisualDirection(preferences, layered).pose.id).toBe(
      "three-quarter-outerwear",
    );
    expect(buildAvatarVisualDirection(preferences, outfit).pose.id).toBe(
      "standing-clear",
    );
    expect(avatarRenderFingerprint(layered, preferences, settings)).not.toBe(
      avatarRenderFingerprint(outfit, preferences, settings),
    );
    expect(
      avatarRenderFingerprint([...layered].reverse(), preferences, settings),
    ).toBe(avatarRenderFingerprint(layered, preferences, settings));
  });

  it("includes the visual pose manifest even when garment facts stay unchanged", () => {
    const first = avatarRenderFingerprint(outfit, preferences, settings);
    const otherPose = buildAvatarVisualDirection(preferences, [
      { ...shirt, category: "dress", subcategory: "dress" },
    ]);
    vi.mocked(buildAvatarVisualDirection).mockReturnValueOnce(otherPose);
    expect(avatarRenderFingerprint(outfit, preferences, settings)).not.toBe(
      first,
    );
  });

  it("invalidates cached images when render quality changes", () => {
    const medium = getAvatarRenderSettings({ OPENAI_IMAGE_QUALITY: "medium" });
    const high = getAvatarRenderSettings({ OPENAI_IMAGE_QUALITY: "high" });
    expect(avatarRenderFingerprint(outfit, preferences, medium)).not.toBe(
      avatarRenderFingerprint(outfit, preferences, high),
    );
  });
});

describe("avatar image checkpoints", () => {
  const result = {
    assetId: "ae781e34-b315-44a5-abfe-0c6c074a49c8",
    renderFingerprint: "a".repeat(64),
  };
  const signal = new AbortController().signal;
  const verified = {
    ...result,
    bucket: "previews" as const,
    storagePath: "workspace/preview.png",
    mimeType: "image/png" as const,
    byteSize: 4,
    width: 1024,
    height: 1536,
    bytes: new Uint8Array([137, 80, 78, 71]),
  };

  it("restores only verified private image bytes without creating another asset", async () => {
    vi.mocked(readVerifiedWorkspaceStorageAsset).mockResolvedValueOnce(
      verified,
    );
    await expect(
      restoreAvatarCheckpoint(result, result.renderFingerprint, signal, {}),
    ).resolves.toEqual({ ...result, createdAsset: false });
    expect(readVerifiedWorkspaceStorageAsset).toHaveBeenCalledWith(
      result.assetId,
      { signal },
    );
  });

  it.each([
    [{ ...result, createdAsset: true }, {}, "AVATAR_CHECKPOINT_UNUSABLE"],
    [result, { signedUrl: "forbidden" }, "AVATAR_CHECKPOINT_UNUSABLE"],
    [{ ...result, renderFingerprint: "b".repeat(64) }, {}, "INPUT_SUPERSEDED"],
  ])(
    "rejects incompatible or stale checkpoints before reading storage",
    async (saved, metadata, code) => {
      await expect(
        restoreAvatarCheckpoint(
          saved,
          result.renderFingerprint,
          signal,
          metadata,
        ),
      ).rejects.toMatchObject({ code, status: 409, retryable: false });
      expect(readVerifiedWorkspaceStorageAsset).not.toHaveBeenCalled();
    },
  );

  it.each([
    { bucket: "wardrobe" as const },
    { mimeType: "image/jpeg" as const },
  ])(
    "rejects a verified asset outside generated private PNG output",
    async (override) => {
      vi.mocked(readVerifiedWorkspaceStorageAsset).mockResolvedValueOnce({
        ...verified,
        ...override,
      });
      await expect(
        restoreAvatarCheckpoint(result, result.renderFingerprint, signal),
      ).rejects.toMatchObject({
        code: "AVATAR_CHECKPOINT_UNUSABLE",
        status: 409,
      });
    },
  );

  it("keeps transport failures retryable while treating missing or foreign assets as unusable", async () => {
    vi.mocked(readVerifiedWorkspaceStorageAsset).mockRejectedValueOnce({
      upstreamStatus: 503,
    });
    await expect(
      restoreAvatarCheckpoint(result, result.renderFingerprint, signal),
    ).rejects.toMatchObject({ code: "PROVIDER_SERVER_ERROR", retryable: true });
    vi.mocked(readVerifiedWorkspaceStorageAsset).mockRejectedValueOnce({
      code: "INVALID_STORAGE_ASSET",
    });
    await expect(
      restoreAvatarCheckpoint(result, result.renderFingerprint, signal),
    ).rejects.toMatchObject({
      code: "AVATAR_CHECKPOINT_UNUSABLE",
      status: 409,
      retryable: false,
    });
  });
});
