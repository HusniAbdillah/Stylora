import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceDatabase,
  type WorkspaceDatabase,
} from "@/lib/supabase/server";
import { previewPollStatus } from "./poll-status";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supabase/server")>()),
  getWorkspaceDatabase: vi.fn(),
}));

const workspaceId = "cccf56bf-ac67-417e-bef1-f43dc6a87aa1";
const draftId = "5b611486-d163-4891-af5a-cc49469b2331";
const operationId = "208eddd1-b0af-4bf1-99f6-3d6e79f3000c";
const requestId = "873f4581-4ee6-4547-937f-53da95a60111";
const foreignId = "84817460-c1da-409e-ac87-8b20b152879e";

function query(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function setup() {
  const draft = {
    id: draftId,
    workspace_id: workspaceId,
    revision: 3,
    payload: { renderRequestId: requestId },
  };
  const operation = {
    id: operationId,
    workspace_id: workspaceId,
    subject_id: draftId,
    input_revision: 3,
    status: "running",
    created_at: "2026-11-08T00:00:00Z",
    completed_at: null as string | null,
  };
  const drafts = query(draft);
  const operations = query(operation);
  const preferences = query({ workspace_id: workspaceId, revision: 8 });
  const tables = {
    workflow_drafts: drafts,
    workflow_operations: operations,
    user_preferences: preferences,
  };
  const client = {
    from: vi.fn((table: keyof typeof tables) => tables[table]),
    storage: { from: vi.fn() },
  };
  vi.mocked(getWorkspaceDatabase).mockReturnValue({
    client,
    workspaceId,
    writesEnabled: false,
  } as unknown as WorkspaceDatabase);
  return { draft, operation, drafts, operations, preferences, client };
}

beforeEach(() => vi.clearAllMocks());

describe("lightweight Preview status", () => {
  it("returns fenced status and preference revisions without reading inputs or signing images", async () => {
    const { client, drafts, operations, preferences } = setup();
    expect(await previewPollStatus(draftId)).toEqual({
      mode: "poll",
      draftId,
      revision: 3,
      renderRequestId: requestId,
      preferenceRevision: 8,
      operationId,
      operationStatus: "running",
      elapsedSeconds: undefined,
    });
    for (const read of [drafts, operations, preferences])
      expect(read.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
    expect(drafts.eq).toHaveBeenCalledWith("feature_kind", "preview");
    expect(drafts.eq).toHaveBeenCalledWith("status", "active");
    expect(operations.eq).toHaveBeenCalledWith("subject_id", draftId);
    expect(operations.eq).toHaveBeenCalledWith("input_revision", 3);
    expect(client.from.mock.calls.map(([table]) => table)).toEqual([
      "workflow_drafts",
      "workflow_operations",
      "user_preferences",
    ]);
    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it("rejects a foreign draft before reading its child operation or preferences", async () => {
    const { draft, client } = setup();
    draft.workspace_id = foreignId;
    await expect(previewPollStatus(draftId)).rejects.toMatchObject({
      code: "preview_not_found",
      status: 404,
    });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it.each(["workspace_id", "subject_id", "input_revision"] as const)(
    "rejects an operation with mismatched %s",
    async (field) => {
      const { operation } = setup();
      Object.assign(operation, {
        [field]: field === "input_revision" ? 4 : foreignId,
      });
      await expect(previewPollStatus(draftId)).rejects.toMatchObject({
        code: "preview_status_failed",
        status: 503,
      });
    },
  );

  it("returns a terminal status and elapsed time without asset reads", async () => {
    const { operation } = setup();
    operation.status = "succeeded";
    operation.completed_at = "2026-11-08T00:00:12Z";
    expect(await previewPollStatus(draftId)).toMatchObject({
      operationStatus: "succeeded",
      elapsedSeconds: 12,
    });
  });

  it("reports no operation without fabricating execution", async () => {
    const { operations } = setup();
    operations.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await previewPollStatus(draftId)).toMatchObject({
      operationId: null,
      operationStatus: null,
    });
  });
});
