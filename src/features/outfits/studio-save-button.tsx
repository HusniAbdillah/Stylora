"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { Button } from "@/components/ui";
import {
  startOperationRequest,
  retryOperationRequest,
} from "@/features/operations/client";
import { saveStudioLook } from "./studio-save";

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

  async function prepareImage(operationId: string, retry = false) {
    const url = `/api/avatars/${operationId}`;
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
    }
  }

  async function save() {
    if (busy.current || saved) return;
    busy.current = true;
    setStatus("Saving outfit…");
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
    if (!result.ok) {
      setStatus(
        result.code === "REVISION_CONFLICT"
          ? "This outfit changed. Reload before saving."
          : "The outfit could not be saved. Try again.",
      );
      return;
    }
    setSaved(result);
    setStatus("Outfit saved. Image preparing.");
    await prepareImage(result.operationId);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={save} disabled={disabled || Boolean(saved)}>
        {saved ? "Outfit saved" : label}
      </Button>
      <p className="max-w-xs text-sm text-secondary" role="status">
        {status}
      </p>
      {saved ? (
        <Link
          className="text-sm text-crimson underline"
          href={`/preview?savedLookId=${saved.savedLookId}`}
        >
          Open saved preview
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
