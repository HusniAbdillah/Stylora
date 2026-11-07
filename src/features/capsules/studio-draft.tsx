"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useWorkspaceChrome } from "@/components/shell";
import { Button, ConfirmDialog, StateNotice } from "@/components/ui";
import { requestOperation } from "@/features/operations/client";
import { CapsuleWizard } from "./capsule-wizard";
import {
  capsuleBriefReady,
  draftInputSchema,
  preparedCapsuleSchema,
  type CapsuleDraftState,
  type PreparedCapsule,
} from "./schema";
import type { CapsuleDraft, CapsuleItem } from "./capsule-types";
import {
  canApplyPreparation,
  capsuleAutoReady,
  preparationBaseline,
} from "./draft-preparation";

const drafts = new Map<string, CapsuleDraftState>();
const saving = new Map<string, Promise<void>>();
const loaded = new Map<string, CapsuleDraftState>();
const preparing = new Map<string, Promise<PreparedCapsule>>();
const acknowledged = new Map<string, PreparedCapsule>();
const dirtyDrafts = new Set<string>();
const subscribe = () => () => {};

function recoverDraft(initial: CapsuleDraftState, recoverPrevious: boolean) {
  const known = loaded.get(initial.id);
  if (known) return known;
  let recovered = drafts.get(initial.id) ?? initial;
  try {
    const recoveryId =
      initial.revision === 0 && recoverPrevious
        ? (localStorage.getItem("stylora.capsule.active") ?? initial.id)
        : initial.id;
    const cached = JSON.parse(
      localStorage.getItem(`stylora.capsule.draft:${recoveryId}`) ??
        localStorage.getItem("stylora.capsule.draft") ??
        "null",
    ) as CapsuleDraftState | null;
    const parsed =
      cached &&
      draftInputSchema.safeParse({
        brief: cached.brief,
        step: cached.step,
        visited: cached.visited,
        expectedRevision: cached.revision,
      });
    if (
      cached &&
      z.uuid().safeParse(cached.id).success &&
      (cached.id === initial.id ||
        (initial.revision === 0 && recoverPrevious)) &&
      parsed?.success &&
      cached.revision >= initial.revision
    )
      recovered = cached;
  } catch {
    /* Ignore a damaged local recovery copy. */
  }
  loaded.set(initial.id, recovered);
  return recovered;
}

export function CapsuleDraftStudio({
  initial,
  ownedItems,
  writesEnabled,
  recoverPrevious = true,
  baseBrief,
}: {
  initial: CapsuleDraftState;
  ownedItems: CapsuleItem[];
  writesEnabled: boolean;
  recoverPrevious?: boolean;
  baseBrief?: CapsuleDraft;
}) {
  const router = useRouter();
  const draft = useSyncExternalStore(
    subscribe,
    () => recoverDraft(initial, recoverPrevious),
    () => initial,
  );
  const [status, setStatus] = useState<"saving" | "saved" | "failed">();
  useWorkspaceChrome({
    breadcrumbs: [
      { label: "Capsules", href: "/capsules" },
      { label: "New capsule" },
    ],
    draftStatus: status,
  });
  const [message, setMessage] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const current = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const active = useRef(true);
  const initialSnapshot = useRef(initial);

  const mirror = useCallback((next: CapsuleDraftState) => {
    const merged = {
      ...next,
      revision: Math.max(next.revision, drafts.get(next.id)?.revision ?? 0),
    };
    current.current = merged;
    drafts.set(next.id, merged);
    try {
      localStorage.setItem(
        `stylora.capsule.draft:${next.id}`,
        JSON.stringify(merged),
      );
      if (active.current)
        localStorage.setItem("stylora.capsule.active", next.id);
    } catch {
      /* Server persistence remains authoritative. */
    }
  }, []);

  const ensurePrepared = useCallback(
    async (snapshot: CapsuleDraftState, navigate = false) => {
      if (
        !writesEnabled ||
        dirty.current ||
        dirtyDrafts.has(snapshot.id) ||
        !capsuleBriefReady(snapshot.brief) ||
        snapshot.brief.includedItemIds.some(
          (id) =>
            !ownedItems.some(
              (item) => item.id === id && item.inventoryStatus === "owned",
            ),
        )
      )
        return;
      const editingExisting =
        snapshot.capsuleId && snapshot.capsuleId !== snapshot.id;
      const destructiveEdit =
        editingExisting &&
        JSON.stringify(snapshot.brief) !== JSON.stringify(baseBrief);
      if (
        !navigate &&
        (snapshot.step !== 3 ||
          destructiveEdit ||
          saving.has(snapshot.id) ||
          !capsuleAutoReady(snapshot.brief, ownedItems))
      )
        return;
      let pending = preparing.get(snapshot.id);
      if (!pending) {
        pending = requestOperation(
          `prepare:${snapshot.id}:${snapshot.revision}`,
          "/api/capsules",
          {
            draftId: snapshot.id,
            expectedRevision: snapshot.revision,
            brief: snapshot.brief,
          },
        ).then(async (response) => {
          const payload = z
            .object({
              data: preparedCapsuleSchema.optional(),
              error: z.object({ message: z.string() }).optional(),
            })
            .parse(await response.json());
          if (!response.ok || !payload.data)
            throw new Error(
              payload.error?.message ??
                "Your capsule could not be prepared. Your draft is kept.",
            );
          const previous = acknowledged.get(snapshot.id);
          if (!previous || payload.data.draftRevision >= previous.draftRevision)
            acknowledged.set(snapshot.id, payload.data);
          return payload.data;
        });
        preparing.set(snapshot.id, pending);
      }
      let prepared: PreparedCapsule;
      try {
        prepared = await pending;
      } finally {
        if (preparing.get(snapshot.id) === pending)
          preparing.delete(snapshot.id);
      }
      const latest = current.current;
      const matches = canApplyPreparation(
        latest,
        snapshot,
        prepared,
        dirty.current || dirtyDrafts.has(snapshot.id),
      );
      if (!matches) return;
      mirror({
        ...latest,
        capsuleId: prepared.capsuleId,
        capsuleRevision: prepared.capsuleRevision,
        revision: prepared.draftRevision,
      });
      void requestOperation(
        `capsule:${prepared.capsuleId}:${prepared.capsuleRevision}`,
        `/api/capsules/${prepared.capsuleId}/generate`,
        {},
      ).catch(() => {
        if (current.current.capsuleId === prepared.capsuleId && !dirty.current)
          setMessage(
            "The saved capsule is preparing. Open its result to check progress or retry.",
          );
      });
      if (navigate) {
        loaded.delete(initialSnapshot.current.id);
        router.push(`/capsules/${prepared.capsuleId}?generate=1`);
      }
      return prepared;
    },
    [writesEnabled, ownedItems, mirror, router, baseBrief],
  );

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!writesEnabled || !dirty.current)
      return saving.get(current.current.id) ?? Promise.resolve();
    dirty.current = false;
    setStatus("saving");
    const snapshot = current.current;
    let saved = false;
    const previous = saving.get(snapshot.id) ?? Promise.resolve();
    const pending = previous
      .then(async () => {
        await preparing.get(snapshot.id)?.catch(() => undefined);
        const latest = drafts.get(snapshot.id) ?? snapshot;
        const receipt = acknowledged.get(snapshot.id);
        const baseline = preparationBaseline(latest, receipt);
        const response = await fetch(`/api/capsules/drafts/${snapshot.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            brief: snapshot.brief,
            step: snapshot.step,
            visited: snapshot.visited,
            expectedRevision: baseline.revision,
            capsuleId: baseline.capsuleId,
            capsuleRevision: baseline.capsuleRevision,
          }),
        });
        const result = z
          .object({
            data: z
              .object({ id: z.uuid(), revision: z.number().int().positive() })
              .optional(),
            error: z.object({ code: z.string() }).optional(),
          })
          .parse(await response.json());
        if (!response.ok || !result.data) {
          dirty.current = true;
          setStatus("failed");
          setMessage(
            result.error?.code === "draft_conflict"
              ? "This draft changed in another session. Your edits are kept here. Reopen the saved draft before applying them."
              : "Your draft could not be saved. Your edits are kept on this browser. Retry saving.",
          );
          return;
        }
        mirror({
          ...(drafts.get(snapshot.id) ?? current.current),
          revision: result.data.revision,
          capsuleId: baseline.capsuleId,
          capsuleRevision: baseline.capsuleRevision,
        });
        setStatus(dirty.current ? "saving" : "saved");
        setMessage("");
        saved = true;
        const latestInput = drafts.get(snapshot.id) ?? current.current;
        if (
          JSON.stringify(latestInput.brief) ===
            JSON.stringify(snapshot.brief) &&
          latestInput.step === snapshot.step &&
          latestInput.visited === snapshot.visited
        )
          dirtyDrafts.delete(snapshot.id);
        if (active.current && window.location.pathname === "/capsules/new") {
          window.history.replaceState(
            window.history.state,
            "",
            `/capsules/new?draftId=${snapshot.id}`,
          );
        }
      })
      .catch(() => {
        dirty.current = true;
        setStatus("failed");
        setMessage(
          "Your draft could not be saved. Your edits are kept on this browser. Retry saving.",
        );
      });
    saving.set(snapshot.id, pending);
    void pending.then(() => {
      if (saving.get(snapshot.id) !== pending) return;
      saving.delete(snapshot.id);
      if (saved && !dirty.current && !dirtyDrafts.has(snapshot.id))
        void ensurePrepared(current.current).catch((error: unknown) => {
          if (!dirty.current)
            setMessage(
              error instanceof Error
                ? error.message
                : "The capsule could not be prepared. Your draft is saved.",
            );
        });
    });
    return pending;
  }, [writesEnabled, mirror, ensurePrepared]);

  useEffect(() => {
    current.current = draft;
    active.current = true;
    const original = initialSnapshot.current;
    const recoveredEdits =
      draft.id !== original.id ||
      draft.step !== original.step ||
      draft.visited !== original.visited ||
      JSON.stringify(draft.brief) !== JSON.stringify(original.brief);
    if (recoveredEdits) {
      dirty.current = true;
      dirtyDrafts.add(draft.id);
      void Promise.resolve().then(flush);
    } else if (draft.revision > 0) {
      void Promise.resolve()
        .then(() => ensurePrepared(draft))
        .catch(() => {});
    }
    const leave = () => {
      void flush();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      active.current = false;
      leave();
      loaded.delete(initial.id);
      window.removeEventListener("pagehide", leave);
    };
  }, [draft, flush, initial.id, ensurePrepared]);

  function change(
    brief: CapsuleDraft,
    step = current.current.step,
    visited = current.current.visited,
  ) {
    mirror({ ...current.current, brief, step, visited });
    dirty.current = true;
    dirtyDrafts.add(current.current.id);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, 600);
  }

  async function build() {
    setBuilding(true);
    setApplyOpen(false);
    try {
      if (current.current.revision === 0) {
        dirty.current = true;
        dirtyDrafts.add(current.current.id);
      }
      await flush();
      if (
        dirty.current ||
        dirtyDrafts.has(current.current.id) ||
        !writesEnabled
      )
        return;
      current.current = drafts.get(current.current.id) ?? current.current;
      await ensurePrepared(current.current, true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your capsule could not be prepared. Your draft is kept.",
      );
    } finally {
      setBuilding(false);
    }
  }

  function requestBuild() {
    const snapshot = current.current;
    if (
      snapshot.capsuleId &&
      snapshot.capsuleId !== snapshot.id &&
      JSON.stringify(snapshot.brief) !== JSON.stringify(baseBrief)
    )
      setApplyOpen(true);
    else void build();
  }

  return (
    <>
      {!writesEnabled && (
        <StateNotice title="Changes are disabled">
          You can review this draft. Saving and generation are unavailable while
          workspace writes are disabled.
        </StateNotice>
      )}
      {message && (
        <div className="mb-4">
          <StateNotice
            title="Draft status"
            action={
              <Button
                variant="secondary"
                disabled={building}
                onClick={() =>
                  status === "failed" ? void flush() : requestBuild()
                }
              >
                {status === "failed" ? "Retry saving" : "Retry preparation"}
              </Button>
            }
          >
            {message}
          </StateNotice>
        </div>
      )}
      <CapsuleWizard
        key={draft.id + draft.revision}
        initialDraft={draft.brief}
        initialStep={draft.step}
        initialVisited={draft.visited}
        ownedItems={ownedItems}
        busy={building || !writesEnabled}
        onDraftChange={change}
        onStepChange={(step, visited) =>
          change(current.current.brief, step, visited)
        }
        onBackToCollection={() => {
          void flush();
          router.push("/capsules");
        }}
        onBuild={requestBuild}
      />
      <ConfirmDialog
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        onConfirm={() => void build()}
        title="Apply this capsule brief?"
        description="Applying these edits replaces the capsule's generated combinations with a fresh result. Your draft is kept if generation fails."
        confirmLabel="Apply brief"
        busy={building}
      />
    </>
  );
}
