import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requestFashion: vi.fn(),
  getLookContext: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: () => ({
    client: { rpc: mocks.rpc },
    workspaceId: "workspace",
    writesEnabled: true,
  }),
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("@/features/inspiration/server", () => ({
  getLookContext: mocks.getLookContext,
}));
vi.mock("@/lib/ai/provider", () => ({
  requestFashion: mocks.requestFashion,
  withFashionOperation: vi.fn(),
  safeProviderError: vi.fn(),
}));

import { startLookOperation } from "./create";

describe("Create input readiness before allocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it.each([null, "", "   "])(
    "rejects missing occasion %s without operation or provider work",
    async (occasion) => {
      mocks.getLookContext.mockResolvedValue({
        look: {
          id: "6762a315-1490-409b-909b-f424450b06af",
          revision: 1,
          inspiration_asset_id: "ad77a8cf-c749-48b1-b463-d21dd65ab503",
          occasion,
        },
        pieces: [],
      });
      for (const kind of [
        "inspiration_description",
        "inspiration_confidence",
        "wardrobe_match",
        "outfit_options",
      ]) {
        await expect(
          startLookOperation("6762a315-1490-409b-909b-f424450b06af", {
            kind,
            execute: false,
          }),
        ).rejects.toMatchObject({ code: "occasion_required", status: 409 });
      }
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.requestFashion).not.toHaveBeenCalled();
    },
  );
});
