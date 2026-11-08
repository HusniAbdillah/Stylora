import { z } from "zod";
import type { Json } from "@/types/database";
import {
  fashionTaskSettingsSchema,
  type FashionTaskSettings,
} from "@/lib/ai/task-settings";
import { fingerprintOperationInput } from "./fingerprint";
import { isRetryableCreateFailureCode } from "./create-failure";

export const CREATE_RUNTIME_VERSION = "owner2-create.v10";
export const createKindSchema = z.enum([
  "inspiration_description",
  "inspiration_confidence",
  "wardrobe_match",
  "outfit_options",
  "option_regeneration",
]);
export type CreateKind = z.infer<typeof createKindSchema>;

export function createResultMatchesRuntime(
  metadata: unknown,
  settings: FashionTaskSettings,
  versions: {
    promptAssemblyHash: string;
    promptVersion: string;
    schemaVersion: string;
  },
) {
  const parsed = z
    .object({
      providerSettings: fashionTaskSettingsSchema,
      model: z.string(),
      promptAssemblyHash: z.string(),
      promptVersion: z.string(),
      schemaVersion: z.string(),
      handlerVersion: z.literal(CREATE_RUNTIME_VERSION),
    })
    .safeParse(metadata);
  return (
    parsed.success &&
    parsed.data.model === settings.model &&
    fingerprintOperationInput(parsed.data) ===
      fingerprintOperationInput({
        providerSettings: settings,
        model: settings.model,
        promptAssemblyHash: versions.promptAssemblyHash,
        promptVersion: versions.promptVersion,
        schemaVersion: versions.schemaVersion,
        handlerVersion: CREATE_RUNTIME_VERSION,
      })
  );
}

export function matchesCoverCurrentInput(
  rows: { piece_id: string; input_metadata: unknown }[],
  pieceIds: string[],
  expected: {
    inventoryMode: "sample" | "live" | "combined";
    inventoryFingerprint: string;
    preferenceFingerprint: string;
  },
) {
  const metadata = z.object({
    inventoryMode: z.literal(expected.inventoryMode),
    inventoryFingerprint: z.literal(expected.inventoryFingerprint),
    preferenceFingerprint: z.literal(expected.preferenceFingerprint),
  });
  return (
    rows.length === pieceIds.length &&
    rows.length > 0 &&
    new Set(rows.map((row) => row.piece_id)).size === pieceIds.length &&
    rows.every(
      (row) =>
        pieceIds.includes(row.piece_id) &&
        metadata.safeParse(row.input_metadata).success,
    )
  );
}

export function createInputSnapshot(input: {
  kind: CreateKind;
  look: {
    id: string;
    revision: number;
    inspiration_asset_id: string | null;
    occasion: string | null;
  };
  pieces: unknown[];
  inventoryMode: "sample" | "live" | "combined";
  personalization?: {
    fingerprint: string;
    preferenceData: unknown;
    preferences: unknown;
  };
  inventory?: {
    items: { id: string; revision: number }[];
    fingerprint: string;
  };
  optionType?: string;
  intentId?: string;
  draftId?: string;
  providerSettings?: FashionTaskSettings;
}): Record<string, Json> {
  const snapshot: Record<string, Json> = {
    lookId: input.look.id,
    lookRevision: input.look.revision,
    assetId: input.look.inspiration_asset_id,
    occasion: input.look.occasion,
    inventoryMode: input.inventoryMode,
    runtimeVersion: CREATE_RUNTIME_VERSION,
  };
  if (input.kind !== "inspiration_description") {
    if (!input.personalization)
      throw new Error("create_personalization_required");
    snapshot.preferenceFingerprint = input.personalization.fingerprint;
    snapshot.preferenceData = z
      .json()
      .parse(input.personalization.preferenceData);
    snapshot.preferences = z.json().parse(input.personalization.preferences);
  }
  if (
    ["wardrobe_match", "outfit_options", "option_regeneration"].includes(
      input.kind,
    )
  ) {
    if (!input.inventory) throw new Error("create_inventory_required");
    snapshot.inventoryState = input.inventory.items
      .map((item) => ({ id: item.id, revision: item.revision }))
      .sort((a, b) => a.id.localeCompare(b.id));
    snapshot.inventoryFingerprint = input.inventory.fingerprint;
    snapshot.pieces = z.json().parse(input.pieces);
  }
  if (input.optionType) snapshot.optionType = input.optionType;
  if (input.draftId) snapshot.draftId = input.draftId;
  if (input.providerSettings)
    snapshot.providerSettings = z.json().parse(input.providerSettings);
  if (input.intentId) snapshot.intentId = input.intentId;
  return snapshot;
}

export function createOperationFingerprint(input: {
  kind: CreateKind;
  input: Record<string, Json>;
  versions: unknown;
  model: string;
  subjectId: string;
  revision: number;
}) {
  return fingerprintOperationInput({
    kind: input.kind,
    input: input.input,
    versions: input.versions,
    handlerVersion: CREATE_RUNTIME_VERSION,
    model: input.model,
    subjectId: input.subjectId,
    revision: input.revision,
  });
}

type OperationPolicyInput = {
  input: unknown;
  status: string;
  input_fingerprint: string;
  attempt_count: number;
  provider_call_count: number;
  result_ref: unknown;
  safe_error_code?: string | null;
};

export function createOperationPolicy(
  op: OperationPolicyInput,
  currentFingerprint: string | null,
  now = Date.now(),
) {
  const captured = z
    .object({
      assetId: z.uuid().optional(),
      runtimeVersion: z.string().optional(),
    })
    .safeParse(op.input);
  const retryable =
    z.object({ retryable: z.literal(true) }).safeParse(op.result_ref).success &&
    isRetryableCreateFailureCode(op.safe_error_code);
  const deferred = z
    .object({ retryAfter: z.iso.datetime() })
    .safeParse(op.result_ref);
  const retryAfter = deferred.success ? deferred.data.retryAfter : null;
  const checkpointed = z
    .object({ checkpointed: z.literal(true) })
    .safeParse(op.result_ref).success;
  const terminal = ["succeeded", "failed", "cancelled", "superseded"].includes(
    op.status,
  );
  const runtimeVersion = captured.success
    ? (captured.data.runtimeVersion ?? null)
    : null;
  const retryBlockedReason =
    op.status !== "failed"
      ? "not_failed"
      : !currentFingerprint
        ? "current_input_unavailable"
        : runtimeVersion !== CREATE_RUNTIME_VERSION
          ? "runtime_changed"
          : currentFingerprint !== op.input_fingerprint
            ? "input_changed"
            : op.attempt_count >= 3
              ? "attempt_limit"
              : op.provider_call_count >= 3 && !checkpointed
                ? "provider_call_limit"
                : !retryable
                  ? "non_retryable"
                  : retryAfter && Date.parse(retryAfter) > now
                    ? "retry_backoff"
                    : null;
  return {
    assetId: captured.success ? (captured.data.assetId ?? null) : null,
    runtimeVersion,
    currentRuntimeVersion: CREATE_RUNTIME_VERSION,
    currentInputFingerprint: currentFingerprint,
    canRetry: retryBlockedReason === null,
    retryBlockedReason,
    retryAfter,
    canRestart:
      terminal &&
      currentFingerprint !== null &&
      currentFingerprint !== op.input_fingerprint,
    providerCallCount: op.provider_call_count,
    attemptsRemaining: Math.max(0, 3 - op.attempt_count),
    providerCallsRemaining: Math.max(0, 3 - op.provider_call_count),
  };
}
