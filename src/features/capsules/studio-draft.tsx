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
import { Button, StateNotice } from "@/components/ui";
import { CapsuleWizard } from "./capsule-wizard";
import { draftInputSchema, type CapsuleDraftState } from "./schema";
import type { CapsuleDraft, CapsuleItem } from "./capsule-types";

const drafts = new Map<string, CapsuleDraftState>();
const saving = new Map<string, Promise<void>>();
const loaded = new Map<string, CapsuleDraftState>();
const subscribe = () => () => {};

function recoverDraft(initial: CapsuleDraftState) {
  const known = loaded.get(initial.id);
  if (known) return known;
  let recovered = drafts.get(initial.id) ?? initial;
  try {
    const cached = JSON.parse(
      localStorage.getItem("stylora.capsule.draft") ?? "null",
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
      (cached.id === initial.id || initial.revision === 0) &&
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
}: {
  initial: CapsuleDraftState;
  ownedItems: CapsuleItem[];
  writesEnabled: boolean;
}) {
  const router = useRouter();
  const draft = useSyncExternalStore(
    subscribe,
    () => recoverDraft(initial),
    () => initial,
  );
  const [status, setStatus] = useState<"saving" | "saved" | "failed">();
  const [message, setMessage] = useState("");
  const current = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);

  const mirror = useCallback((next: CapsuleDraftState) => {
    current.current = next;
    drafts.set(next.id, next);
    try {
      localStorage.setItem("stylora.capsule.draft", JSON.stringify(next));
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
          }),
        });
        const result = (await response.json()) as {
          ok: boolean;
          revision?: number;
          code?: string;
        };
        if (!response.ok || !result.ok || !result.revision) {
          dirty.current = true;
          setStatus("failed");
          setMessage(
            result.code === "draft_conflict"
              ? "This draft changed in another session. Your edits are kept here. Reopen the saved draft before applying them."
              : "Your draft could not be saved. Your edits are kept on this browser. Retry saving.",
          );
          return;
        }
        mirror({ ...current.current, revision: result.revision });
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
        onDraftChange={change}
        onStepChange={(step, visited) =>
          change(current.current.brief, step, visited)
        }
        onBackToCollection={() => {
          void flush();
          router.push("/capsules");
        }}
        onBuild={async () => {
          await flush();
          if (!dirty.current && current.current.revision > 0) setMessage("Your brief is ready. Capsule generation is being connected. Your saved draft is available from Capsules.");
        }}
      />
    </WorkspaceShell>
  );
}
