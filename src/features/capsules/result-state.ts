import { createHash } from "node:crypto";
import { z } from "zod";
import { capsuleBriefSchema } from "./schema";

type Context = {
  brief: z.infer<typeof capsuleBriefSchema>;
  revision: number;
  preferenceRevision: number;
  itemRevisions: Record<string, number | undefined>;
  runtime: {
    model: string;
    promptVersion: string;
    schemaVersion: string;
    knowledgeVersion: string;
  };
};
type Completed = {
  input: unknown;
  input_revision: number;
  result_ref: unknown;
  model: string | null;
  prompt_version: string | null;
  schema_version: string | null;
};
const capturedSchema = z.object({
  brief: capsuleBriefSchema,
  preferenceRevision: z.number().int().nonnegative(),
  itemRevisions: z.record(z.uuid(), z.number().int().positive()),
  knowledgeVersion: z.string(),
});

export function capsuleResultNeedsGeneration(
  completed: Completed | null,
  current: Context,
  outfitIds: string[],
) {
  if (!completed) return true;
  const captured = capturedSchema.safeParse(completed.input);
  const result = z
    .object({ outfitIds: z.array(z.uuid()).min(3).max(6) })
    .safeParse(completed.result_ref);
  if (!captured.success || !result.success) return true;
  if (
    completed.model !== current.runtime.model ||
    completed.prompt_version !== current.runtime.promptVersion ||
    completed.schema_version !== current.runtime.schemaVersion ||
    captured.data.knowledgeVersion !== current.runtime.knowledgeVersion ||
    JSON.stringify(captured.data.brief) !==
      JSON.stringify(capsuleBriefSchema.parse(current.brief)) ||
    captured.data.preferenceRevision !== current.preferenceRevision ||
    current.brief.includedItemIds.some(
      (id) => captured.data.itemRevisions[id] !== current.itemRevisions[id],
    )
  )
    return true;
  const original = new Set(result.data.outfitIds);
  if (outfitIds.some((id) => !original.has(id))) return true;
  const removed = original.size - outfitIds.length;
  return current.revision - completed.input_revision !== removed;
}

export function capsuleResultContextKey(current: Context) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        ...current,
        itemRevisions: current.brief.includedItemIds
          .map((id) => [id, current.itemRevisions[id] ?? null])
          .sort(),
      }),
    )
    .digest("hex");
}
