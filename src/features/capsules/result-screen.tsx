"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LoadingLayout, StateNotice } from "@/components/ui";
import {
  requestOperation,
  startOperationRequest,
} from "@/features/operations/client";
import { saveStudioLook } from "@/features/outfits/studio-save";
import { SavedLooksLoading } from "@/features/decisions/saved-loading";
import { CapsuleOutfitDetail, CapsuleResults } from "./capsule-results";
import type { CapsuleResult } from "./capsule-types";
import { feedbackRequest } from "@/lib/feedback/request";
import { publishFeedback } from "@/lib/feedback/store";

type Props = {
  result: CapsuleResult;
  revision: number;
  outfitId?: string;
  generationNeeded?: boolean;
};

export function CapsuleResultScreen({
  result,
  revision,
  outfitId,
  generationNeeded = false,
}: Props) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [operationId, setOperationId] = useState<string>();
  const savingRequest = useRef(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(
    result.outfits.length === 0 && generationNeeded,
  );
  const generate = useCallback(async () => {
    setRunning(true);
    setMessage("");
    try {
      const response = await requestOperation(
        `capsule:${result.id}:${revision}`,
        `/api/capsules/${result.id}/generate`,
        {},
      );
      const payload = (await response.json()) as {
        data?: { id: string; status: string };
        error?: { message: string };
      };
      if (!response.ok || !payload.data)
        throw new Error(
          payload.error?.message ??
            "Capsule generation is unavailable. Your brief is saved. Retry or edit your items.",
        );
      setOperationId(payload.data.id);
      if (payload.data.status === "succeeded") {
        router.replace(`/capsules/${result.id}`);
        router.refresh();
      } else
        setMessage(
          payload.data.status === "running"
            ? "Your outfits are still preparing. Refresh the saved result in a moment."
            : "Capsule generation could not finish. Your brief and selected pieces are saved. Retry or edit the capsule.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Capsule generation is unavailable. Your brief is saved.",
      );
    } finally {
      setRunning(false);
    }
  }, [result.id, revision, router]);

  useEffect(() => {
    if (generationNeeded) {
      void Promise.resolve().then(generate);
    }
  }, [result.outfits.length, generationNeeded, generate]);

  async function save(outfit: string) {
    if (savingRequest.current) return;
    if (running || generationNeeded) {
      setMessage(
        "Fresh combinations are preparing for the current wardrobe and preferences. Save after they finish.",
      );
      return;
    }
    savingRequest.current = true;
    setSaving(true);
    setMessage("");
    setOperationId(undefined);
    const feedbackId = `capsule-save:${outfit}`;
    publishFeedback({
      id: feedbackId,
      label: "Save capsule outfit",
      state: "running",
      detail: "Saving the outfit snapshot.",
    });
    const response = await saveStudioLook({
      source: { kind: "capsule", id: outfit, parentId: result.id },
      expectedRevision: revision,
      title:
        result.outfits.find((item) => item.id === outfit)?.title ??
        result.title,
      idempotencyKey: `studio:capsule:${outfit}:${revision}`,
    }).catch(() => ({ ok: false as const }));
    if (response.ok) {
      publishFeedback({
        id: feedbackId,
        label: "Capsule outfit saved",
        state: "complete",
        detail: "Outfit saved. Avatar image has its own status.",
        href: `/saved-looks/${response.savedLookId}`,
      });
      void startOperationRequest(
        response.operationId,
        `/api/avatars/${response.operationId}`,
        { method: "POST" },
      ).catch(() => {});
      router.push(`/saved-looks/${response.savedLookId}`);
    } else {
      publishFeedback({
        id: feedbackId,
        label: "Capsule outfit could not be saved",
        state: "failed",
        detail: "Your capsule is kept. Retry saving.",
      });
      savingRequest.current = false;
      setSaving(false);
      setMessage(
        "This look could not be saved. Your capsule is kept. Retry saving.",
      );
    }
  }

  async function retry() {
    if (operationId)
      await fetch(`/api/workflow-operations/${operationId}/retry`, {
        method: "POST",
      });
    await generate();
  }

  async function deleteOutfit(id: string) {
    setOperationId(undefined);
    try {
      const response = await feedbackRequest(
        `/api/capsules/${result.id}/outfits/${id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRevision: revision }),
        },
      );
      if (response.ok) {
        router.push(`/capsules/${result.id}`);
        router.refresh();
      } else
        setMessage(
          "The outfit could not be deleted. Reload the capsule to check its latest revision.",
        );
    } catch {
      setMessage(
        "Could not connect. Your outfit is kept. Try deleting it again.",
      );
    }
  }

  const index = result.outfits.findIndex((outfit) => outfit.id === outfitId);
  const selected = result.outfits[index];
  return (
    <>
      {saving ? (
        <SavedLooksLoading detail />
      ) : (
        <>
          {running && result.outfits.length > 0 && (
            <div className="mb-4">
              <StateNotice title="Checking your capsule">
                The saved combinations stay visible while the current input
                revision is checked.
              </StateNotice>
            </div>
          )}
          {message && (
            <div className="mb-4">
              <StateNotice
                title="Capsule status"
                action={
                  !result.outfits.length || operationId ? (
                    <Button
                      variant="secondary"
                      disabled={running}
                      onClick={() => void retry()}
                    >
                      Retry generation
                    </Button>
                  ) : undefined
                }
              >
                {message}
              </StateNotice>
            </div>
          )}
          {!result.outfits.length ? (
            <section>
              <h1 className="font-serif text-4xl">
                {running ? "Preparing your outfits" : result.title}
              </h1>
              <p className="my-4 text-sm text-secondary">
                {running || generationNeeded
                  ? "Your capsule brief and selected owned pieces are saved. Complete, validated combinations will appear here."
                  : "No outfits remain in this capsule. Edit the saved brief to prepare fresh combinations."}
              </p>
              {running && (
                <LoadingLayout kind="ideas" label="Preparing capsule outfits" />
              )}
              <Button
                variant="quiet"
                onClick={() =>
                  router.push(`/capsules/new?capsuleId=${result.id}`)
                }
              >
                Edit brief
              </Button>
            </section>
          ) : selected ? (
            <CapsuleOutfitDetail
              outfit={selected}
              index={index + 1}
              total={result.outfits.length}
              onSaveAsLook={(id) => void save(id)}
              onDelete={(id) => void deleteOutfit(id)}
              onBack={() => router.push(`/capsules/${result.id}`)}
            />
          ) : (
            <CapsuleResults
              result={result}
              onSaveCapsule={() => router.push("/capsules")}
              onEditBrief={() =>
                router.push(`/capsules/new?capsuleId=${result.id}`)
              }
              onOpenOutfit={(id) =>
                router.push(`/capsules/${result.id}/outfits/${id}`)
              }
              onSaveAsLook={(id) => void save(id)}
              onPreview={(id) =>
                router.push(`/preview?capsuleId=${result.id}&outfitId=${id}`)
              }
            />
          )}
        </>
      )}
    </>
  );
}
