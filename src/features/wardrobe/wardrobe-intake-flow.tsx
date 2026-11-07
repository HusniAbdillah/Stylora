"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui";
import { WardrobeIntake } from "./wardrobe-intake";
import {
  deleteWardrobePhoto,
  readWardrobePhoto,
  saveWardrobePhoto,
} from "./wardrobe-intake-storage";
import {
  changeField,
  draftPointer,
  intakeFields,
  notifyWardrobeChanged,
  uploadWardrobeFile,
  wardrobeRequest,
  type WardrobeDraft,
} from "./client";
import type { ItemValues } from "./schema";

const pointer = "stylora:wardrobe-intake.v1";
const bufferPointer = "stylora:wardrobe-upload-buffer.v1";
export function WardrobeIntakeFlow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WardrobeDraft | null>(null);
  const current = useRef(draft);
  const [selectedId, setSelectedId] = useState<string>();
  const [stage, setStage] = useState<
    "empty" | "uploading" | "analyzing" | "ready" | "error" | "added"
  >("empty");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [provisionalCount, setProvisionalCount] = useState(0);
  const [watchingDraft, setWatchingDraft] = useState<string>();
  const [fieldText, setFieldText] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<
    "discard" | "replace" | null
  >(null);
  const pendingFile = useRef<File | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const dirty = useRef(false);
  const mutationVersion = useRef(0);

  const accept = useCallback((next: WardrobeDraft) => {
    current.current = next;
    setDraft(next);
    draftPointer(pointer, next.id);
  }, []);
  function report(failure: unknown) {
    setError(
      failure instanceof Error
        ? failure.message
        : "The draft could not be saved. Try again.",
    );
  }
  useEffect(() => {
    if (!open || current.current) return;
    let active = true;
    const id = draftPointer(pointer);
    if (id) {
      wardrobeRequest<WardrobeDraft>(`/drafts/${id}`)
        .then((saved) => {
          if (!active) return;
          if (saved.status !== "active") {
            draftPointer(pointer, null);
            return;
          }
          accept(saved);
          setSelectedId(
            saved.payload.proposals.find((p) => !saved.payload.saved[p.id])?.id,
          );
          setStage(
            saved.payload.proposals.length
              ? "ready"
              : saved.assetId
                ? "error"
                : "empty",
          );
        })
        .catch((failure) => {
          if (active) report(failure);
        });
    }
    return () => {
      active = false;
    };
  }, [open, accept]);

  useEffect(() => {
    if (!open || !watchingDraft) return;
    let active = true;
    let timer: number | undefined;
    async function check() {
      try {
        const state = await wardrobeRequest<{
          operation: { status: string } | null;
          leaseExpired: boolean;
        }>(`/drafts/${watchingDraft}/analyze`);
        if (!active) return;
        if (state.operation?.status === "succeeded") {
          const saved = await wardrobeRequest<WardrobeDraft>(
            `/drafts/${watchingDraft}`,
          );
          if (!active) return;
          accept(saved);
          setSelectedId(
            saved.payload.proposals.find((p) => !saved.payload.saved[p.id])?.id,
          );
          setStage("ready");
          setWatchingDraft(undefined);
        } else if (
          state.operation &&
          ["queued", "running", "partial"].includes(state.operation.status) &&
          !state.leaseExpired
        ) {
          setStage("analyzing");
          timer = window.setTimeout(() => void check(), 1500);
        } else {
          setStage("error");
          setWatchingDraft(undefined);
          if (state.leaseExpired)
            setError(
              "Description was interrupted. Your photo is saved; retry the description.",
            );
        }
      } catch (failure) {
        if (active) {
          report(failure);
          setStage("error");
          setWatchingDraft(undefined);
        }
      }
    }
    void check();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [open, watchingDraft, accept]);

  const flush = useCallback(() => {
    const task = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        const snapshot = current.current;
        if (!snapshot || !dirty.current) return;
        const version = mutationVersion.current;
        const saved = await wardrobeRequest<WardrobeDraft>(
          `/drafts/${snapshot.id}`,
          "PATCH",
          {
            expectedRevision: snapshot.revision,
            proposals: snapshot.payload.proposals.map(({ id, values }) => ({
              id,
              values,
            })),
          },
        );
        if (mutationVersion.current === version) {
          dirty.current = false;
          accept(saved);
        } else {
          const latest = current.current!;
          accept({ ...latest, revision: saved.revision });
        }
        if (saved.assetId && !saved.payload.proposals.length)
          setWatchingDraft(saved.id);
      });
    saveQueue.current = task;
    return task;
  }, [accept]);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => {
      void flush().catch(report);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, flush]);

  function edit(id: string, update: (values: ItemValues) => ItemValues) {
    if (!current.current || busy || current.current.payload.saved[id]) return;
    mutationVersion.current++;
    dirty.current = true;
    const next = {
      ...current.current,
      payload: {
        ...current.current.payload,
        proposals: current.current.payload.proposals.map((p) =>
          p.id === id ? { ...p, values: update(p.values) } : p,
        ),
      },
    };
    accept(next);
    setError(undefined);
  }
  async function analyze(saved: WardrobeDraft) {
    setStage("analyzing");
    setProvisionalCount(0);
    const op = await wardrobeRequest<{ id: string }>(
      `/drafts/${saved.id}/analyze`,
      "POST",
      { expectedRevision: saved.revision },
    );
    const response = await fetch(`/api/wardrobe/operations/${op.id}/run`, {
      method: "POST",
    });
    if (!response.body)
      throw new Error(
        "Photo description could not start. Retry or enter details manually.",
      );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let complete = false;
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.type === "piece") setProvisionalCount(message.index + 1);
        if (message.type === "error")
          throw new Error(
            message.error?.message ??
              "Description is unavailable. Retry or enter details manually.",
          );
        if (message.type === "complete") {
          complete = true;
          accept(message.data.draft);
          if (message.data.operation.status !== "succeeded")
            throw new Error(
              "Photo description could not finish. Retry or enter details manually.",
            );
          setSelectedId(message.data.draft.payload.proposals[0]?.id);
          setStage("ready");
        }
      }
      if (done) break;
    }
    if (!complete)
      throw new Error(
        "Description was interrupted. Your photo is saved; retry the description.",
      );
  }
  async function pick(file: File) {
    setWatchingDraft(undefined);
    setBusy(true);
    setError(undefined);
    setStage("uploading");
    try {
      await flush();
      const key = await saveWardrobePhoto(file);
      draftPointer(bufferPointer, key);
      let saved = current.current;
      if (saved?.status === "active")
        await wardrobeRequest(`/drafts/${saved.id}`, "DELETE", {
          expectedRevision: saved.revision,
        });
      saved = await wardrobeRequest<WardrobeDraft>("/drafts", "POST", {});
      accept(saved);
      saved = await uploadWardrobeFile(file, saved, accept);
      accept(saved);
      await deleteWardrobePhoto(key);
      draftPointer(bufferPointer, null);
      await analyze(saved);
    } catch (failure) {
      report(failure);
      setStage("error");
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setBusy(true);
    setError(undefined);
    try {
      const key = draftPointer(bufferPointer);
      if (key && !current.current?.assetId) {
        const blob = await readWardrobePhoto(key);
        if (!blob)
          throw new Error("Choose the photo again to retry its upload.");
        const file = new File([blob], "wardrobe-photo", { type: blob.type });
        const saved =
          current.current ??
          (await wardrobeRequest<WardrobeDraft>("/drafts", "POST", {}));
        const uploaded = await uploadWardrobeFile(file, saved, accept);
        accept(uploaded);
        await deleteWardrobePhoto(key);
        draftPointer(bufferPointer, null);
      }
      if (!current.current?.assetId)
        throw new Error("Choose a photo before requesting its description.");
      const saved = await wardrobeRequest<WardrobeDraft>(
        `/drafts/${current.current.id}`,
      );
      accept(saved);
      await analyze(saved);
    } catch (failure) {
      report(failure);
      setStage("error");
    } finally {
      setBusy(false);
    }
  }
  async function manual() {
    setWatchingDraft(undefined);
    if (!current.current) return;
    setBusy(true);
    try {
      const saved = await wardrobeRequest<WardrobeDraft>(
        `/drafts/${current.current.id}/manual`,
        "POST",
        { expectedRevision: current.current.revision },
      );
      accept(saved);
      setSelectedId(saved.payload.proposals[0].id);
      setError(undefined);
      setStage("ready");
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(id: string) {
    setBusy(true);
    setError(undefined);
    try {
      await flush();
      const saved = current.current!;
      const proposal = saved.payload.proposals.find((p) => p.id === id)!;
      const result = await wardrobeRequest<{ draft: WardrobeDraft }>(
        `/drafts/${saved.id}/confirm`,
        "POST",
        {
          expectedRevision: saved.revision,
          proposalId: id,
          values: proposal.values,
        },
      );
      accept(result.draft);
      notifyWardrobeChanged();
      setStage("added");
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    setWatchingDraft(undefined);
    setBusy(true);
    try {
      await saveQueue.current.catch(() => undefined);
      const saved = current.current;
      if (saved?.status === "active")
        await wardrobeRequest(`/drafts/${saved.id}`, "DELETE", {
          expectedRevision: saved.revision,
        });
      const key = draftPointer(bufferPointer);
      if (key) await deleteWardrobePhoto(key);
      draftPointer(pointer, null);
      draftPointer(bufferPointer, null);
      current.current = null;
      setDraft(null);
      setStage("empty");
      setConfirmation(null);
      onClose();
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  const remaining =
    draft?.payload.proposals.filter((p) => !draft.payload.saved[p.id]) ?? [];
  const shown =
    stage === "added"
      ? (draft?.payload.proposals.filter((p) => p.id === selectedId) ?? [])
      : remaining;
  return (
    <>
      <WardrobeIntake
        open={open}
        status={stage}
        proposals={shown.map((p) => ({
          id: p.id,
          name: p.values.name,
          category: p.values.category,
          imageUrl: draft?.imageUrl,
          fields: intakeFields(
            p.values,
            p.original
              ? Object.fromEntries(
                  p.original.observations.map(({ path, ...evidence }) => [
                    path,
                    evidence,
                  ]),
                )
              : undefined,
            p.original,
          ).map((field) => ({
            ...field,
            value: fieldText[`${p.id}:${field.key}`] ?? field.value,
          })),
        }))}
        selectedProposalId={selectedId}
        onSelectProposal={setSelectedId}
        busy={busy}
        hasDraft={Boolean(draft)}
        provisionalCount={provisionalCount}
        errorMessage={error}
        inlineError={stage !== "error" ? error : undefined}
        descriptionSource={draft?.payload.mode === "live" ? "ai" : "manual"}
        onClose={() => {
          void flush().then(onClose).catch(report);
        }}
        onPickImage={(file) => {
          if (draft?.assetId) {
            pendingFile.current = file;
            setConfirmation("replace");
          } else void pick(file);
        }}
        onNameChange={(id, name) => edit(id, (v) => ({ ...v, name }))}
        onCategoryChange={(id, category) =>
          edit(id, (v) => ({ ...v, category }))
        }
        onFieldChange={(id, key, text) => {
          setFieldText((previous) => ({ ...previous, [`${id}:${key}`]: text }));
          edit(id, (v) => changeField(v, key, text));
        }}
        onFieldBlur={(id, key) =>
          setFieldText((previous) => {
            const next = { ...previous };
            delete next[`${id}:${key}`];
            return next;
          })
        }
        onConfirm={(id) => void confirm(id)}
        onRetry={() => void retry()}
        onManualEntry={draft?.assetId ? () => void manual() : undefined}
        onDiscardDraft={() => setConfirmation("discard")}
        onAddAnother={
          stage === "added" && remaining.length
            ? () => {
                setSelectedId(remaining[0].id);
                setStage("ready");
              }
            : undefined
        }
        onFinish={() => {
          if (draft?.status === "completed") {
            draftPointer(pointer, null);
            current.current = null;
            setDraft(null);
            setStage("empty");
          }
          onClose();
        }}
      />
      <ConfirmDialog
        open={confirmation !== null}
        title={
          confirmation === "discard"
            ? "Discard this draft?"
            : "Replace this draft photo?"
        }
        description={
          confirmation === "discard"
            ? "The unsaved proposal details will be discarded. Already saved wardrobe items stay available."
            : "The unsaved descriptions will be replaced with a new photo draft."
        }
        confirmLabel={
          confirmation === "discard" ? "Discard draft" : "Replace photo"
        }
        busy={busy}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation === "discard") void discard();
          else if (pendingFile.current) {
            const file = pendingFile.current;
            pendingFile.current = null;
            setConfirmation(null);
            void pick(file);
          }
        }}
      />
    </>
  );
}
