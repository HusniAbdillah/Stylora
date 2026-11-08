import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCapsuleInventory } from "./drafts";

const mocks = vi.hoisted(() => ({ database: vi.fn(), signedReads: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getWorkspaceDatabase: mocks.database,
  requireWorkspaceWrites: vi.fn(),
}));
vi.mock("@/lib/supabase/storage", () => ({
  createWorkspaceSignedReads: mocks.signedReads,
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const assetId = "873f4581-4ee6-4547-937f-53da95a60111";
const fixture = Array.from({ length: 501 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: `Sample ${String(index + 1).padStart(4, "0")}`,
  category: "top",
  asset_id: index === 500 ? assetId : null,
  revision: 1,
}));
function setup(rows = fixture, failStart?: number) {
  const calls: {
    filters: [string, unknown][];
    orders: string[];
    range?: [number, number];
  }[] = [];
  mocks.database.mockReturnValue({
    workspaceId,
    client: {
      from: vi.fn(() => {
        const call = {
          filters: [] as [string, unknown][],
          orders: [] as string[],
          range: undefined as [number, number] | undefined,
        };
        calls.push(call);
        const query = {
          select: vi.fn().mockReturnThis(),
          eq: (field: string, value: unknown) => {
            call.filters.push([field, value]);
            return query;
          },
          order: (field: string) => {
            call.orders.push(field);
            return query;
          },
          range: async (start: number, end: number) => {
            call.range = [start, end];
            return start === failStart
              ? { data: null, error: { code: "08006" } }
              : { data: rows.slice(start, end + 1), error: null };
          },
        };
        return query;
      }),
    },
  });
  mocks.signedReads.mockResolvedValue(
    new Map([[assetId, "fixture-private-image"]]),
  );
  return calls;
}
beforeEach(() => vi.resetAllMocks());

describe("Capsule owned inventory pagination", () => {
  it("retains valid outfit members beyond the first page with stable scoped ordering and private image reads", async () => {
    const calls = setup();
    const items = await getCapsuleInventory();
    expect(items).toHaveLength(501);
    expect(items[500]).toMatchObject({
      id: fixture[500].id,
      imageUrl: "fixture-private-image",
      inventoryStatus: "owned",
    });
    expect(calls.map((call) => call.range)).toEqual([
      [0, 499],
      [500, 999],
    ]);
    for (const call of calls) {
      expect(call.filters).toContainEqual(["workspace_id", workspaceId]);
      expect(call.orders).toEqual(["name", "id"]);
    }
    expect(mocks.signedReads).toHaveBeenCalledWith([assetId]);
  });

  it("fails rather than returning a truncated inventory when a later page cannot be read", async () => {
    setup(fixture, 500);
    await expect(getCapsuleInventory()).rejects.toThrow(
      "capsule_inventory_read_failed",
    );
    expect(mocks.signedReads).not.toHaveBeenCalled();
  });

  it("finishes an empty owned inventory after one query", async () => {
    const calls = setup([]);
    await expect(getCapsuleInventory()).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
