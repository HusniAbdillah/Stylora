import "server-only";
import { isDeepStrictEqual } from "node:util";
import { ApiError } from "@/lib/api";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type Operation = Database["public"]["Tables"]["workflow_operations"]["Row"];

export async function readCreateCheckpoint(op: Operation, signal: AbortSignal) {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("operation_result_checkpoints")
    .select("result,metadata,kind,prompt_version,schema_version,model")
    .eq("workspace_id", workspaceId)
    .eq("operation_id", op.id)
    .eq("input_fingerprint", op.input_fingerprint)
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(10000)]))
    .maybeSingle();
  if (error)
    throw new ApiError(
      "operation_checkpoint_unavailable",
      "The saved analysis result could not be checked. Retry after checking the operation status.",
      502,
      true,
    );
  if (
    data &&
    (data.kind !== op.kind ||
      data.prompt_version !== op.prompt_version ||
      data.schema_version !== op.schema_version ||
      data.model !== op.model)
  )
    throw new ApiError(
      "operation_checkpoint_invalid",
      "The saved analysis belongs to another configuration. Start a new analysis.",
      409,
      false,
    );
  return data;
}

export async function persistCreateCheckpoint(
  op: Operation,
  result: Json,
  metadata: Json,
  signal: AbortSignal,
) {
  const { client, workspaceId } = getWorkspaceDatabase();
  if (
    Buffer.byteLength(JSON.stringify(result)) > 512 * 1024 ||
    Buffer.byteLength(JSON.stringify(metadata)) > 16 * 1024
  )
    throw new ApiError(
      "operation_checkpoint_invalid",
      "The analysis result exceeds the storage limit. Narrow the input before restarting.",
      422,
      false,
    );
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const { data, error } = await client
      .rpc("checkpoint_workflow_result", {
        p_workspace_id: workspaceId,
        p_operation_id: op.id,
        p_attempt: op.attempt_count,
        p_input_fingerprint: op.input_fingerprint,
        p_result: result,
        p_metadata: metadata,
      })
      .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(5000)]));
    if (!error) return data;
    if (error.code === "40001")
      throw new ApiError(
        "input_superseded",
        "The saved analysis no longer belongs to the active operation.",
        409,
      );
    if (["22023", "23514"].includes(error.code))
      throw new ApiError(
        "operation_checkpoint_invalid",
        "The analysis result did not meet the storage contract.",
        502,
        false,
      );
  }
  const saved = await readCreateCheckpoint(op, signal);
  if (
    saved &&
    isDeepStrictEqual(saved.result, result) &&
    isDeepStrictEqual(saved.metadata, metadata)
  )
    return saved;
  throw new ApiError(
    "operation_checkpoint_unavailable",
    "The validated analysis could not be saved. Check its status before retrying.",
    502,
    true,
  );
}
