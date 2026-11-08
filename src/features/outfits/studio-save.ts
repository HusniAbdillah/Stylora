"use server";

import { z } from "zod";
import { readDatabaseConfig } from "@/lib/config/server";
import { scheduleWorkflowDispatch } from "@/features/operations/queue-wake";

const saveInput = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("preview"), id: z.uuid() }),
    z.object({ kind: z.literal("capsule"), id: z.uuid(), parentId: z.uuid() }),
  ]),
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  idempotencyKey: z.string().trim().min(1).max(200),
});

const savedResult = z.object({ savedLookId: z.uuid(), operationId: z.uuid() });

export async function saveStudioLook(input: z.input<typeof saveInput>) {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success)
    return { ok: false as const, code: "SAVE_INPUT_INVALID" };
  const config = readDatabaseConfig();
  if (!config)
    return { ok: false as const, code: "WORKSPACE_CONFIGURATION_UNAVAILABLE" };
  if (!config.writesEnabled)
    return { ok: false as const, code: "WORKSPACE_WRITES_DISABLED" };
  const request = parsed.data;
  try {
    // The generated UUID argument type omits PostgreSQL's nullable parent contract.
    const response = await fetch(`${config.url}/rest/v1/rpc/save_studio_look`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.secretKey,
      },
      body: JSON.stringify({
        p_workspace_id: config.workspaceId,
        p_source_kind: request.source.kind,
        p_source_id: request.source.id,
        p_parent_id:
          request.source.kind === "capsule" ? request.source.parentId : null,
        p_expected_revision: request.expectedRevision,
        p_idempotency_key: request.idempotencyKey,
        p_title: request.title,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const body = z
        .object({ code: z.string() })
        .safeParse(await response.json());
      const code = body.success ? body.data.code : "";
      if (code === "PGRST202")
        return { ok: false as const, code: "STUDIO_SAVE_CONTRACT_UNAVAILABLE" };
      if (code === "40001")
        return { ok: false as const, code: "REVISION_CONFLICT" };
      return { ok: false as const, code: "LOOK_SAVE_FAILED" };
    }
    const saved = savedResult.safeParse(await response.json());
    if (!saved.success)
      return { ok: false as const, code: "LOOK_SAVE_INVALID_RESPONSE" };
    scheduleWorkflowDispatch();
    return { ok: true as const, ...saved.data };
  } catch {
    return { ok: false as const, code: "LOOK_SAVE_CONNECTION_FAILED" };
  }
}
