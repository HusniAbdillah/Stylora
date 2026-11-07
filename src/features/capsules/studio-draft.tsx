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
import { WorkspaceShell } from "@/components/shell";
import { Button, ConfirmDialog, StateNotice } from "@/components/ui";
import { CapsuleWizard } from "./capsule-wizard";
import { draftInputSchema, type CapsuleDraftState } from "./schema";
import type { CapsuleDraft, CapsuleItem } from "./capsule-types";

const drafts = new Map<string, CapsuleDraftState>();
const saving = new Map<string, Promise<void>>();
const loaded = new Map<string, CapsuleDraftState>();
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
}: {
  initial: CapsuleDraftState;
  ownedItems: CapsuleItem[];
  writesEnabled: boolean;
  recoverPrevious?: boolean;
}) {
  const router = useRouter();
  const draft = useSyncExternalStore(
    subscribe,
    () => recoverDraft(initial, recoverPrevious),
    () => initial,
  );
  const [status, setStatus] = useState<"saving" | "saved" | "failed">();
  const [message, setMessage] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const current = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);

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
      localStorage.setItem("stylora.capsule.active", next.id);
    } catch {
      /* Server persistence remains authoritative. */
    }
  }, []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!writesEnabled || !dirty.current)
      return saving.get(current.current.id) ?? Promise.resolve();
    dirty.current = false;
    setStatus("saving");
    const snapshot = current.current;
    const previous = saving.get(snapshot.id) ?? Promise.resolve();
    const pending = previous
      .then(async () => {
        const latest = drafts.get(snapshot.id) ?? snapshot;
        const response = await fetch(`/api/capsules/drafts/${snapshot.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            brief: snapshot.brief,
            step: snapshot.step,
            visited: snapshot.visited,
            expectedRevision: latest.revision,
            capsuleId: snapshot.capsuleId,
            capsuleRevision: snapshot.capsuleRevision,
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
        });
        setStatus(dirty.current ? "saving" : "saved");
        setMessage("");
      })
      .catch(() => {
        dirty.current = true;
        setStatus("failed");
        setMessage(
          "Your draft could not be saved. Your edits are kept on this browser. Retry saving.",
        );
      });
    saving.set(snapshot.id, pending);
    return pending;
  }, [writesEnabled, mirror]);

  useEffect(() => {
    current.current = draft;
    const leave = () => {
      void flush();
    };
    window.addEventListener("pagehide", leave);
    return () => {
      leave();
      loaded.delete(initial.id);
      window.removeEventListener("pagehide", leave);
    };
  }, [draft, flush, initial.id]);

  function change(
    brief: CapsuleDraft,
    step = current.current.step,
    visited = current.current.visited,
  ) {
    mirror({ ...current.current, brief, step, visited });
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush();
    }, 600);
  }

  async function build() {
    setBuilding(true);
    setApplyOpen(false);
    try {
      if (current.current.revision === 0) dirty.current = true;
      await flush();
      if (dirty.current || !writesEnabled) return;
      current.current = drafts.get(current.current.id) ?? current.current;
      const response = await fetch("/api/capsules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: current.current.id,
          expectedRevision: current.current.revision,
        }),
      });
      const payload = z
        .object({
          data: z.object({ capsuleId: z.uuid() }).optional(),
          error: z.object({ message: z.string() }).optional(),
        })
        .parse(await response.json());
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message ??
            "Your capsule could not be prepared. Your draft is kept.",
        );
      try {
        localStorage.removeItem(`stylora.capsule.draft:${current.current.id}`);
        if (
          localStorage.getItem("stylora.capsule.active") === current.current.id
        )
          localStorage.removeItem("stylora.capsule.active");
        localStorage.removeItem("stylora.capsule.draft");
      } catch {
        /* The saved draft remains available on the server. */
      }
      drafts.delete(current.current.id);
      loaded.delete(initial.id);
      router.push(`/capsules/${payload.data.capsuleId}?generate=1`);
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

  return (
    <WorkspaceShell
      activeHref="/capsules"
      displayName="Studio guest"
      activity={[]}
      breadcrumbs={[
        { label: "Capsules", href: "/capsules" },
        { label: "New capsule" },
      ]}
      draftStatus={status}
    >
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
              <Button variant="secondary" onClick={() => void flush()}>
                Retry saving
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
        onBuild={() =>
          current.current.capsuleId ? setApplyOpen(true) : void build()
        }
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
    </WorkspaceShell>
  );
}
