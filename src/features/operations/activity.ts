import "server-only";
import { z } from "zod";
import { getWorkspaceDatabase } from "@/lib/supabase/server";
import { OperationError } from "./errors";
import { operationStatusSchema } from "./schema";

const querySchema = z.strictObject({
  status: operationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const activitySchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  status: operationStatusSchema,
  subject_type: z.string(),
  subject_id: z.uuid(),
  input_revision: z.number().int().positive(),
  attempt_count: z.number().int().min(0).max(3),
  safe_error_code: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export async function readOperationActivity(
  parameters: Record<string, string>,
) {
  const parsed = querySchema.safeParse(parameters);
  if (!parsed.success)
    throw new OperationError(
      "INVALID_OPERATION_QUERY",
      "Choose a valid status and list limit.",
      400,
    );
  const context = getWorkspaceDatabase();
  let query = context.client
    .from("workflow_operations")
    .select(
      "id,kind,status,subject_type,subject_id,input_revision,attempt_count,safe_error_code,created_at,updated_at",
    )
    .eq("workspace_id", context.workspaceId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(parsed.data.limit);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  const { data, error } = await query;
  if (error)
    throw new OperationError(
      "OPERATION_ACTIVITY_UNAVAILABLE",
      "Activity could not be loaded. Try again.",
      503,
      true,
    );
  return z
    .array(activitySchema)
    .parse(data)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      inputRevision: row.input_revision,
      attemptCount: row.attempt_count,
      safeErrorCode: row.safe_error_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}
