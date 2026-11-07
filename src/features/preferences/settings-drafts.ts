import { z } from "zod";
import {
  preferencesClientSchema,
  profileDraftClientSchema,
  SettingsApiError,
  settingsRequest,
} from "./client-contract";

export type SettingsFeature = "preferences" | "profile";

const draftMetadata = {
  id: z.uuid(),
  revision: z.number().int().positive(),
  status: z.enum(["active", "completed", "discarded"]),
  updatedAt: z.string(),
};
const settingsDraftSchema = z.discriminatedUnion("featureKind", [
  z.object({
    ...draftMetadata,
    featureKind: z.literal("preferences"),
    payload: preferencesClientSchema,
  }),
  z.object({
    ...draftMetadata,
    featureKind: z.literal("profile"),
    payload: profileDraftClientSchema,
  }),
]);
export type SettingsDraft = z.infer<typeof settingsDraftSchema>;
export type SettingsDraftInput =
  | {
      featureKind: "preferences";
      payload: z.input<typeof preferencesClientSchema>;
    }
  | {
      featureKind: "profile";
      payload: z.input<typeof profileDraftClientSchema>;
    };

const recoveryMetadata = {
  version: z.literal(1),
  draftId: z.uuid().nullable(),
  savedRevision: z.number().int().positive(),
  updatedAt: z.string(),
};
const recoverySchema = z.discriminatedUnion("featureKind", [
  z.object({
    ...recoveryMetadata,
    featureKind: z.literal("preferences"),
    payload: preferencesClientSchema,
  }),
  z.object({
    ...recoveryMetadata,
    featureKind: z.literal("profile"),
    payload: profileDraftClientSchema,
  }),
]);
export type SettingsRecovery = z.infer<typeof recoverySchema>;

function recoveryKey(scopeKey: string, feature: SettingsFeature) {
  const scope = z
    .string()
    .regex(/^[a-f0-9]{16}$/)
    .parse(scopeKey);
  return `stylora.settings.${scope}.${feature}.v1`;
}

export function readSettingsRecovery(
  scopeKey: string,
  feature: SettingsFeature,
): SettingsRecovery | null {
  const value = localStorage.getItem(recoveryKey(scopeKey, feature));
  if (!value) return null;
  let candidate: unknown;
  try {
    candidate = JSON.parse(value);
  } catch {
    return null;
  }
  const parsed = recoverySchema.safeParse(candidate);
  return parsed.success && parsed.data.featureKind === feature
    ? parsed.data
    : null;
}

export function writeSettingsRecovery(
  scopeKey: string,
  recovery: SettingsRecovery,
) {
  const parsed = recoverySchema.parse(recovery);
  localStorage.setItem(
    recoveryKey(scopeKey, parsed.featureKind),
    JSON.stringify(parsed),
  );
}

export function clearSettingsRecovery(
  scopeKey: string,
  feature: SettingsFeature,
) {
  localStorage.removeItem(recoveryKey(scopeKey, feature));
}

export async function readSettingsDraft(feature: SettingsFeature, id: string) {
  const draft = await settingsRequest(
    `/api/workflow-drafts/${z.uuid().parse(id)}`,
    settingsDraftSchema,
  );
  if (draft.featureKind !== feature) {
    throw new SettingsApiError(
      "invalid_draft",
      "This draft belongs to a different page.",
      404,
    );
  }
  return draft;
}

export function persistSettingsDraft(
  input: SettingsDraftInput,
  current?: SettingsDraft | null,
) {
  if (
    current &&
    (current.featureKind !== input.featureKind || current.status !== "active")
  ) {
    throw new SettingsApiError(
      "invalid_draft",
      "Reload this draft before saving again.",
      409,
    );
  }
  return settingsRequest(
    current ? `/api/workflow-drafts/${current.id}` : "/api/workflow-drafts",
    settingsDraftSchema,
    {
      method: current ? "PATCH" : "POST",
      body: JSON.stringify(
        current
          ? { expectedRevision: current.revision, payload: input.payload }
          : input,
      ),
      keepalive: true,
    },
  );
}

export function closeSettingsDraft(
  draft: SettingsDraft,
  status: "completed" | "discarded",
) {
  return settingsRequest(
    `/api/workflow-drafts/${draft.id}`,
    settingsDraftSchema,
    {
      method: "PATCH",
      body: JSON.stringify({ expectedRevision: draft.revision, status }),
      keepalive: true,
    },
  );
}

type DraftSession = {
  draft: SettingsDraft | null;
  pending: Promise<unknown>;
};

const sessions = new Map<string, DraftSession>();

function getSession(scopeKey: string, feature: SettingsFeature) {
  const key = recoveryKey(scopeKey, feature);
  let session = sessions.get(key);
  if (!session) {
    session = { draft: null, pending: Promise.resolve() };
    sessions.set(key, session);
  }
  return session;
}

async function restoreSession(
  scopeKey: string,
  feature: SettingsFeature,
  session: DraftSession,
) {
  if (session.draft) return;
  let recovery: SettingsRecovery | null;
  try {
    recovery = readSettingsRecovery(scopeKey, feature);
  } catch {
    return;
  }
  if (!recovery?.draftId) return;
  try {
    const draft = await readSettingsDraft(feature, recovery.draftId);
    if (draft.status === "active") session.draft = draft;
  } catch (error) {
    if (!(error instanceof SettingsApiError) || error.status !== 404)
      throw error;
  }
}

export function flushSettingsDraft(
  scopeKey: string,
  input: SettingsDraftInput,
) {
  const session = getSession(scopeKey, input.featureKind);
  const pending = session.pending.then(async () => {
    await restoreSession(scopeKey, input.featureKind, session);
    let draft: SettingsDraft;
    try {
      draft = await persistSettingsDraft(input, session.draft);
    } catch (error) {
      if (error instanceof SettingsApiError && error.status === 409) {
        session.draft = null;
      }
      throw error;
    }
    session.draft = draft;
    let recoveryAvailable = true;
    try {
      const recovery = readSettingsRecovery(scopeKey, input.featureKind);
      if (recovery) {
        writeSettingsRecovery(scopeKey, { ...recovery, draftId: draft.id });
      }
    } catch {
      recoveryAvailable = false;
    }
    return { ...draft, recoveryAvailable };
  });
  session.pending = pending.catch(() => undefined);
  return pending;
}

export function finishSettingsDraft(
  scopeKey: string,
  feature: SettingsFeature,
  status: "completed" | "discarded",
) {
  const session = getSession(scopeKey, feature);
  const pending = session.pending.then(async () => {
    await restoreSession(scopeKey, feature, session);
    if (session.draft) await closeSettingsDraft(session.draft, status);
    session.draft = null;
  });
  session.pending = pending.catch(() => undefined);
  return pending;
}
