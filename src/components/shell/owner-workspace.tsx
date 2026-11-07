"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { z } from "zod";
import { useCreateSession } from "@/features/inspiration/create-session";
import { useCreateWorkspace } from "@/features/inspiration/create-workspace";
import {
  draftSchema,
  stepKeys,
  type CreateDraft,
} from "@/features/inspiration/client-contract";
import {
  readProfile,
  settingsRequest,
} from "@/features/preferences/client-contract";
import {
  operationKindSchema,
  operationStatusSchema,
} from "@/features/operations/schema";
import { getWardrobeCollectionHref } from "@/features/wardrobe/wardrobe-navigation";
import { WorkspaceShell } from "./workspace-shell";
import type { ActivityItem } from "./workspace-navigation";
import styles from "./shell.module.css";

const sections = {
  "/create": "Create",
  "/looks": "Outfit details",
  "/wardrobe": "Wardrobe",
  "/capsules": "Capsules",
  "/preview": "Preview",
  "/preferences": "Preferences",
  "/profile": "Profile",
  "/saved-looks": "Saved looks",
} as const;
const availableHrefs = [
  "/create",
  "/wardrobe",
  "/capsules",
  "/preview",
  "/preferences",
  "/profile",
  "/saved-looks",
];
const stepLabels = {
  upload: "Upload",
  review: "Review pieces",
  matches: "Wardrobe match",
  ideas: "Outfit ideas",
  details: "Outfit details",
} as const;
const operationLabels: Record<z.infer<typeof operationKindSchema>, string> = {
  inspiration_description: "Describe pieces",
  inspiration_confidence: "Review with confidence",
  wardrobe_match: "Wardrobe matching",
  outfit_options: "Three outfit ideas",
  option_regeneration: "Regenerate outfit direction",
  marketplace_search: "Shopping search",
  wardrobe_description: "Describe wardrobe piece",
  capsule_generation: "Capsule generation",
  preview_image: "Outfit preview",
  saved_avatar: "Saved look image",
};
const createOperationKinds = new Set([
  "inspiration_description",
  "inspiration_confidence",
  "wardrobe_match",
  "outfit_options",
  "option_regeneration",
]);
const activityDestinations: Partial<
  Record<z.infer<typeof operationKindSchema>, string>
> = {
  wardrobe_description: "/wardrobe",
  capsule_generation: "/capsules",
  preview_image: "/preview",
};
type WorkspaceActivityItem = ActivityItem & {
  kind: z.infer<typeof operationKindSchema>;
};
const activitySchema = z.array(
  z.object({
    id: z.uuid(),
    kind: operationKindSchema,
    status: operationStatusSchema,
    subjectType: z.string(),
    subjectId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    inputRevision: z.number().int().positive(),
    attemptCount: z.number().int().nonnegative(),
    safeErrorCode: z.string().nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
  }),
);
const recoverySchema = z.object({
  draftId: z.uuid().nullable(),
  lookId: z.uuid().nullable(),
  selectedOptionId: z.uuid().nullable().optional(),
});
const subscribeToHydration = () => () => {};

function draftDestination(
  draft: CreateDraft,
  selectedOptionId?: string | null,
) {
  if (draft.currentStep === "details" && draft.lookId && selectedOptionId) {
    return `/looks/${draft.lookId}?option_id=${selectedOptionId}&draft=${draft.id}`;
  }
  const step =
    draft.currentStep === "details" ? "ideas" : (draft.currentStep ?? "upload");
  return draft.lookId && step !== "upload"
    ? `/create/${draft.lookId}?step=${step}&draft=${draft.id}`
    : `/create?draft=${draft.id}`;
}

function WorkspaceContents({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { scopeKey, writesEnabled } = useCreateWorkspace();
  const { session, state } = useCreateSession(scopeKey);
  const [displayName, setDisplayName] = useState("Workspace profile");
  const [profileError, setProfileError] = useState(false);
  const [activity, setActivity] = useState<WorkspaceActivityItem[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState<CreateDraft | null>(
    null,
  );
  const [recoveredOptionId, setRecoveredOptionId] = useState<string | null>(
    null,
  );
  const [retrying, setRetrying] = useState<string | null>(null);
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const wardrobeHref =
    hydrated && pathname !== "/wardrobe"
      ? getWardrobeCollectionHref()
      : "/wardrobe";

  useEffect(() => {
    if (!state.look || pathname !== `/looks/${state.look.id}`) return;
    const parsed = z.uuid().safeParse(searchParams.get("option_id"));
    if (!parsed.success) return;
    const option = state.look.outfitOptions.find(
      (item) => item.id === parsed.data,
    );
    if (option && option.optionType !== state.selectedDirection) {
      session.selectDirection(option.optionType);
    }
  }, [pathname, searchParams, session, state.look, state.selectedDirection]);
  useEffect(() => {
    const draft = state.draft ?? recoveredDraft;
    if (!draft?.lookId || pathname !== `/looks/${draft.lookId}`) return;
    const selected = z.uuid().safeParse(searchParams.get("option_id"));
    if (!selected.success) return;
    // Detail rendering has already checked option membership server-side.
    try {
      for (const key of [
        `stylora.create.${scopeKey}.v1`,
        `stylora.create.${scopeKey}.v1:draft:${draft.id}`,
      ]) {
        const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
        if (!value || typeof value !== "object" || Array.isArray(value))
          continue;
        const recovery = recoverySchema.safeParse(value);
        if (
          recovery.success &&
          recovery.data.draftId === draft.id &&
          recovery.data.lookId === draft.lookId
        )
          localStorage.setItem(
            key,
            JSON.stringify({ ...value, selectedOptionId: selected.data }),
          );
      }
    } catch {
      /* Navigation still uses the validated option while browser recovery is unavailable. */
    }
  }, [pathname, searchParams, scopeKey, state.draft, recoveredDraft]);

  const refreshActivity = useCallback(async (signal?: AbortSignal) => {
    try {
      const operations = await settingsRequest(
        "/api/workflow-operations",
        activitySchema,
        { signal },
      );
      if (signal?.aborted) return;
      setActivity(
        operations.map((operation): WorkspaceActivityItem => {
          const hasCreateExecutor = createOperationKinds.has(operation.kind);
          const destination = activityDestinations[operation.kind];
          const step =
            operation.kind === "wardrobe_match"
              ? "matches"
              : ["outfit_options", "option_regeneration"].includes(
                    operation.kind,
                  )
                ? "ideas"
                : "review";
          return {
            id: operation.id,
            kind: operation.kind,
            label: operationLabels[operation.kind],
            state:
              operation.status === "succeeded" ? "complete" : operation.status,
            detail:
              operation.status === "failed"
                ? hasCreateExecutor
                  ? "Could not finish. Retry or reopen the look."
                  : destination
                    ? "Could not finish. Open this feature to retry."
                    : "Could not finish."
                : operation.status === "succeeded"
                  ? "Ready"
                  : operation.status === "partial"
                    ? "Partial results available"
                    : operation.status === "superseded"
                      ? "Replaced by newer inputs"
                      : operation.status === "running"
                        ? "In progress"
                        : operation.status === "queued"
                          ? "Waiting to start"
                          : "Cancelled",
            href:
              hasCreateExecutor && operation.subjectType === "look"
                ? `/create/${operation.subjectId}?step=${step}`
                : destination,
          };
        }),
      );
      setActivityError(false);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError"))
        setActivityError(true);
    }
  }, []);

  useEffect(() => {
    let profileController: AbortController | null = null;
    let activityController: AbortController | null = null;
    const refreshProfile = () => {
      profileController?.abort();
      profileController = new AbortController();
      const signal = profileController.signal;
      void readProfile(signal)
        .then((profile) => {
          if (!signal.aborted) {
            setDisplayName(profile.displayName || "Studio guest");
            setProfileError(false);
          }
        })
        .catch((error) => {
          if (!(error instanceof Error && error.name === "AbortError"))
            setProfileError(true);
        });
    };
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      activityController?.abort();
      activityController = new AbortController();
      void refreshActivity(activityController.signal);
    };
    refreshProfile();
    refresh();
    const focus = () => {
      refreshProfile();
      refresh();
    };
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", focus);
    window.addEventListener("stylora:profile-saved", refreshProfile);
    window.addEventListener("stylora:profile-updated", refreshProfile);
    document.addEventListener("visibilitychange", focus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      window.removeEventListener("stylora:profile-saved", refreshProfile);
      window.removeEventListener("stylora:profile-updated", refreshProfile);
      document.removeEventListener("visibilitychange", focus);
      profileController?.abort();
      activityController?.abort();
    };
  }, [refreshActivity]);

  useEffect(() => {
    const controller = new AbortController();
    const restoreResume = () => {
      try {
        const parsed = recoverySchema.safeParse(
          JSON.parse(
            localStorage.getItem(`stylora.create.${scopeKey}.v1`) ?? "null",
          ),
        );
        if (!parsed.success || !parsed.data.draftId) {
          setRecoveredDraft(null);
          setRecoveredOptionId(null);
          return;
        }
        void settingsRequest(
          `/api/workflow-drafts/${parsed.data.draftId}`,
          draftSchema,
          { signal: controller.signal },
        )
          .then((draft) => {
            if (!controller.signal.aborted) {
              setRecoveredDraft(draft.status === "active" ? draft : null);
              setRecoveredOptionId(
                draft.status === "active" && draft.lookId === parsed.data.lookId
                  ? (parsed.data.selectedOptionId ?? null)
                  : null,
              );
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              setRecoveredDraft(null);
              setRecoveredOptionId(null);
            }
          });
      } catch {
        setRecoveredDraft(null);
        setRecoveredOptionId(null);
      }
    };
    restoreResume();
    window.addEventListener("storage", restoreResume);
    return () => {
      controller.abort();
      window.removeEventListener("storage", restoreResume);
    };
  }, [pathname, scopeKey, state.draft]);

  async function retry(id: string) {
    if (
      retrying ||
      !writesEnabled ||
      !activity.some(
        (item) =>
          item.id === id &&
          item.state === "failed" &&
          createOperationKinds.has(item.kind),
      )
    )
      return;
    setRetrying(id);
    try {
      await settingsRequest(
        `/api/workflow-operations/${id}/retry`,
        z.object({ id: z.uuid(), status: operationStatusSchema }),
        { method: "POST" },
      );
      await refreshActivity();
    } catch {
      setActivityError(true);
    } finally {
      setRetrying(null);
    }
  }

  const section =
    Object.keys(sections).find(
      (path) => pathname === path || pathname.startsWith(path + "/"),
    ) ?? "/create";
  const label = sections[section as keyof typeof sections];
  const queryStep = z.enum(stepKeys).safeParse(searchParams.get("step"));
  const draft =
    state.draft?.status === "active"
      ? state.draft
      : state.ready
        ? null
        : recoveredDraft;
  const currentStep = queryStep.success
    ? queryStep.data
    : (draft?.currentStep ?? "upload");
  const detailOption = z.uuid().safeParse(searchParams.get("option_id"));
  const selectedOptionId =
    draft?.lookId &&
    pathname === `/looks/${draft.lookId}` &&
    detailOption.success
      ? detailOption.data
      : state.look && state.look.id === draft?.lookId
        ? (state.look.outfitOptions.find(
            (option) =>
              option.optionType === state.selectedDirection && !option.stale,
          )?.id ?? null)
        : recoveredOptionId;
  const breadcrumbs =
    (section === "/create" && pathname !== "/create") || section === "/looks"
      ? [
          {
            label: "Create",
            href:
              draft && draft.lookId === pathname.split("/")[2]
                ? draftDestination({ ...draft, currentStep: "upload" })
                : "/create",
          },
          {
            label:
              section === "/looks" ? "Outfit details" : stepLabels[currentStep],
          },
        ]
      : pathname === section
        ? [{ label }]
        : [
            { label, href: section === "/wardrobe" ? wardrobeHref : section },
            {
              label:
                section === "/wardrobe"
                  ? "Item details"
                  : section === "/capsules"
                    ? pathname === "/capsules/new"
                      ? "New capsule"
                      : pathname.includes("/outfits/")
                        ? "Outfit details"
                        : "Capsule details"
                    : "Details",
            },
          ];
  const resume = draft
    ? {
        href: draftDestination(draft, selectedOptionId),
        label: `Return to your look, step ${stepKeys.indexOf(draft.currentStep === "details" && !selectedOptionId ? "ideas" : (draft.currentStep ?? "upload")) + 1} of 5`,
      }
    : undefined;
  const activityItems = activity.map((item) => ({
    ...item,
    detail: retrying === item.id ? "Retry requested" : item.detail,
    ...(writesEnabled &&
    item.state === "failed" &&
    createOperationKinds.has(item.kind) &&
    !retrying
      ? {
          onRetry: () => {
            void retry(item.id);
          },
        }
      : {}),
  }));

  return (
    <WorkspaceShell
      activeHref={pathname}
      availableHrefs={availableHrefs}
      destinationHrefs={{
        "/wardrobe": wardrobeHref,
        "/create": draft
          ? draftDestination(draft, selectedOptionId)
          : "/create",
      }}
      breadcrumbs={breadcrumbs}
      displayName={displayName}
      activity={activityItems}
      resume={resume}
      contextLabel="Shared workspace"
      draftStatus={
        section === "/create" && state.draft ? state.draftStatus : undefined
      }
    >
      {profileError && (
        <p className={styles.shellNotice} role="status">
          The shared profile name could not be refreshed. Reopen Profile to
          retry.
        </p>
      )}
      {activityError && (
        <p className={styles.shellNotice} role="status">
          Activity could not be refreshed.
          <button
            type="button"
            onClick={() => {
              void refreshActivity();
            }}
          >
            Retry activity
          </button>
        </p>
      )}
      {children}
    </WorkspaceShell>
  );
}

export function OwnerWorkspace({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <WorkspaceShell
          activeHref=""
          availableHrefs={availableHrefs}
          breadcrumbs={[]}
          displayName="Workspace profile"
          activity={[]}
          contextLabel="Shared workspace"
        >
          {children}
        </WorkspaceShell>
      }
    >
      <WorkspaceContents>{children}</WorkspaceContents>
    </Suspense>
  );
}
