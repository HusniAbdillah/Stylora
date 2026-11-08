"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { Button, Skeleton } from "@/components/ui";
import {
  startOperationRequest,
  retryOperationRequest,
} from "@/features/operations/client";
import { saveStudioLook } from "./studio-save";
import { publishFeedback } from "@/lib/feedback/store";

type Source =
  | { kind: "preview"; id: string }
  | { kind: "capsule"; id: string; parentId: string };

const imageStatus = z.object({
  data: z
    .object({
      status: z.string(),
      resultRef: z
        .object({ retryable: z.boolean().optional() })
        .nullable()
        .optional(),
    })
    .optional(),
  error: z.object({ retryable: z.boolean() }).optional(),
});

export function StudioSaveButton({
  source,
  expectedRevision,
  title,
  disabled = false,
  label = "Save this look",
}: {
  source: Source;
  expectedRevision: number;
  title: string;
  disabled?: boolean;
  label?: string;
}) {
  const busy = useRef(false);
  const [saved, setSaved] = useState<{
    savedLookId: string;
    operationId: string;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);

  async function prepareImage(operationId: string, retry = false) {
    const url = `/api/avatars/${operationId}`;
    setPreparing(true);
    try {
      const response = retry
        ? await retryOperationRequest(operationId, url, {})
        : await startOperationRequest(operationId, url, { method: "POST" });
      const body = imageStatus.parse(await response.json());
      if (!response.ok || body.data?.status === "failed") {
        setStatus("Outfit saved. The image needs attention.");
        setRetryable(
          Boolean(body.error?.retryable || body.data?.resultRef?.retryable),
        );
        return;
      }
      setStatus(
        body.data?.status === "succeeded"
          ? "Outfit saved. Image ready."
          : "Outfit saved. Image preparing.",
      );
    } catch {
      setStatus("Outfit saved. Reopen it to check the image.");
    } finally {
      setPreparing(false);
    }
  }

  async function save() {
    if (busy.current || saved) return;
    busy.current = true;
    setSaving(true);
    setStatus("");
    const feedbackId = `studio-save:${source.kind}:${source.id}`;
    publishFeedback({
      id: feedbackId,
      label: "Save outfit",
      state: "running",
      detail: "Saving the outfit snapshot.",
    });
    const idempotencyKey = `studio:${source.kind}:${source.id}:${expectedRevision}`;
    const result = await saveStudioLook({
      source,
      expectedRevision,
      title,
      idempotencyKey,
    }).catch(() => ({
      ok: false as const,
      code: "LOOK_SAVE_CONNECTION_FAILED",
    }));
    busy.current = false;
    setSaving(false);
    if (!result.ok) {
      publishFeedback({
        id: feedbackId,
        label: "Outfit could not be saved",
        state: "failed",
        detail:
          result.code === "REVISION_CONFLICT"
            ? "This outfit changed. Reload before saving."
            : "Try saving the outfit again.",
      });
      setStatus(
        result.code === "REVISION_CONFLICT"
          ? "This outfit changed. Reload before saving."
          : "The outfit could not be saved. Try again.",
      );
      return;
    }
    setSaved(result);
    publishFeedback({
      id: feedbackId,
      label: "Outfit saved",
      state: "complete",
      detail: "The outfit is saved. Avatar image has its own status.",
      href: `/saved-looks/${result.savedLookId}`,
    });
    setStatus("Outfit saved. Image preparing.");
    await prepareImage(result.operationId);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={save}
        disabled={disabled || saving || Boolean(saved)}
        aria-busy={saving}
      >
        {saved ? "Outfit saved" : label}
      </Button>
      {saving || preparing ? (
        <div
          role="status"
          aria-label={saving ? "Saving outfit" : "Preparing saved image"}
          className="flex w-56 items-center gap-3 rounded-xl border border-stone p-3"
        >
          <Skeleton className="h-14 w-10 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2" aria-hidden="true">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ) : (
        status && (
          <p className="max-w-xs text-sm text-secondary" role="status">
            {status}
          </p>
        )
      )}
      {saved ? (
        <Link
          className="text-sm text-crimson underline"
          href={`/saved-looks/${saved.savedLookId}`}
        >
          View saved look
        </Link>
      ) : null}
      {saved && retryable ? (
        <Button
          variant="secondary"
          onClick={async () => {
            setRetryable(false);
            setStatus("Outfit saved. Retrying image…");
            await prepareImage(saved.operationId, true);
          }}
        >
          Retry image
        </Button>
      ) : null}
    </div>
  );
}
