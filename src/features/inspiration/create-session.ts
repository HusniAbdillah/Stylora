"use client";

import { useSyncExternalStore } from "react";
import { publishFeedback, feedbackError } from "@/lib/feedback/store";
import { z } from "zod";
import { garmentSchema, confidenceSchema } from "@/lib/ai/fashion-schema";
import { readPreferences } from "@/features/preferences/client-contract";
import type { PreferencesDraft } from "@/features/preferences/preferences-types";
import type { PieceEditValues } from "./components/types";
import {
  createRequest,
  draftSchema,
  eventsSchema,
  inspirationPayloadSchema,
  lookSchema,
  operationSchema,
  type CanonicalPiece,
  type CreateDraft,
  type CreateLook,
  type CreateOperation,
  type CreateStep,
} from "./client-contract";
import { retainPendingFile, restorePendingFile } from "./pending-file";
import { startOperationRequest } from "@/features/operations/client";

type ProvisionalPiece = z.infer<typeof garmentSchema> & { id: string };
type SessionState = {
  ready: boolean;
  prefilling: boolean;
  draft: CreateDraft | null;
  look: CreateLook | null;
  preferences: PreferencesDraft;
  preferenceFingerprint: string;
  file: File | null;
  previewUrl: string | null;
  uploadStatus: "empty" | "uploading" | "verified" | "failed";
  error: string | null;
  draftStatus: "saving" | "saved" | "failed";
  operations: CreateOperation[];
  provisional: ProvisionalPiece[];
  provisionalConfidence: z.infer<typeof confidenceSchema> | null;
  selectedDirection: "closest" | "from_wardrobe" | "fresh_alternative";
  hasEditorDraft: boolean;
  contextSaving: boolean;
  inventoryMode: "live" | "sample" | "combined";
};
const initial: SessionState = {
  ready: false,
  prefilling: false,
  draft: null,
  look: null,
  preferences: {},
  preferenceFingerprint: "",
  file: null,
  previewUrl: null,
  uploadStatus: "empty",
  error: null,
  draftStatus: "saved",
  operations: [],
  provisional: [],
  provisionalConfidence: null,
  selectedDirection: "closest",
  hasEditorDraft: false,
  contextSaving: false,
  inventoryMode: "combined",
};
const recoverySchema = z.object({
  draftId: z.uuid().nullable(),
  lookId: z.uuid().nullable(),
  selectedDirection: z
    .enum(["closest", "from_wardrobe", "fresh_alternative"])
    .default("closest"),
  selectedOptionId: z.uuid().nullable().optional(),
  inventoryMode: z.enum(["live", "sample", "combined"]).optional(),
  editor: z
    .object({
      pieceId: z.uuid().nullable(),
      values: z.record(z.string(), z.string()),
    })
    .nullable()
    .optional(),
  cursors: z.record(z.string(), z.number()).default({}),
});
const active = (op: CreateOperation) =>
  ["queued", "running", "partial"].includes(op.status);
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not finish. Your work is retained.";

export class CreateSession {
  writesEnabled = false;
  state: SessionState = { ...initial };
  private listeners = new Set<() => void>();
  private hydration: Promise<void> | null = null;
  private draftCreation: Promise<CreateDraft> | null = null;
  private draftQueue: Promise<unknown> = Promise.resolve();
  private executions = new Map<string, Promise<void>>();
  private observing = new Set<string>();
  private terminalReplays = new Set<string>();
  private provisionalSource: string | null = null;
  private starting = new Map<string, Promise<void>>();
  private prepared = new Set<string>();
  private cursors: Record<string, number> = {};
  private editor: z.infer<typeof recoverySchema>["editor"] = null;
  private temporaryUrl: string | null = null;
  private generation = 0;
  private contextQueue: Promise<void> = Promise.resolve();
  private contextIntent = 0;
  private regenerationAllocations = new Set<string>();
  private modeSelected = false;
  private samplePreparation: Promise<string> | null = null;
  prepareSample() {
    if (this.samplePreparation) return this.samplePreparation;
    this.samplePreparation = (async () => {
      if (!this.writesEnabled)
        throw new Error("Changes are disabled for this workspace.");
      if (this.hydration) await this.hydration;
      await this.draftQueue.catch(() => undefined);
      const pendingKey = `${this.key()}:sample-pending`;
      let pending: string | null = null;
      try {
        const value = z.uuid().safeParse(localStorage.getItem(pendingKey));
        if (value.success) pending = value.data;
      } catch {
        /* Server draft still survives without browser recovery. */
      }
      if (pending) await this.hydrate(pending);
      else {
        this.remember();
        this.generation++;
        this.editor = null;
        this.cursors = {};
        this.modeSelected = false;
        this.update({
          ...initial,
          ready: true,
          prefilling: true,
          preferences: this.state.preferences,
          preferenceFingerprint: this.state.preferenceFingerprint,
        });
      }
      const generation = this.generation;
      const draft = await this.ensureDraft();
      try {
        localStorage.setItem(pendingKey, draft.id);
      } catch {
        /* The URL will retain the draft after preparation. */
      }
      if (this.state.look) return draft.id;
      this.update({ prefilling: true });
      try {
        const response = await fetch("/design/images/inspiration-sample.webp");
        if (!response.ok)
          throw new Error("The sample photo could not load. Try again.");
        const photo = new File([await response.blob()], "sample-outfit.webp", {
          type: "image/webp",
        });
        if (generation !== this.generation)
          throw new DOMException(
            "Sample preparation was superseded.",
            "AbortError",
          );
        const upload = this.upload(photo);
        const uploadGeneration = this.generation;
        await upload;
        if (uploadGeneration !== this.generation)
          throw new DOMException(
            "Sample preparation was superseded.",
            "AbortError",
          );
        return draft.id;
      } finally {
        if (this.state.draft?.id === draft.id)
          this.update({ prefilling: false });
      }
    })().catch((error) => {
      this.samplePreparation = null;
      this.update({ prefilling: false });
      if (!(error instanceof Error && error.name === "AbortError"))
        this.report(error);
      throw error;
    });
    return this.samplePreparation;
  }
  finishSamplePreparation() {
    if (this.samplePreparation && this.state.prefilling) {
      this.generation++;
      this.update({ prefilling: false });
    }
    this.samplePreparation = null;
    try {
      localStorage.removeItem(`${this.key()}:sample-pending`);
    } catch {
      /* URL recovery remains available. */
    }
  }
  constructor(readonly scope: string) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  serverSnapshot = () => initial;
  private key() {
    return `stylora.create.${this.scope}.v1`;
  }
  private update(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private remember() {
    try {
      const recovery = JSON.stringify({
        draftId: this.state.draft?.id ?? null,
        lookId: this.state.look?.id ?? null,
        selectedDirection: this.state.selectedDirection,
        inventoryMode: "combined",
        selectedOptionId:
          this.state.look?.outfitOptions.find(
            (option) =>
              option.optionType === this.state.selectedDirection &&
              option.inventoryMode === this.state.inventoryMode &&
              !option.stale,
          )?.id ?? null,
        editor: this.editor,
        cursors: this.cursors,
      });
      localStorage.setItem(this.key(), recovery);
      if (this.state.draft)
        localStorage.setItem(
          `${this.key()}:draft:${this.state.draft.id}`,
          recovery,
        );
    } catch {
      this.update({ draftStatus: "failed" });
    }
  }
  clearError() {
    this.update({ error: null });
  }
  report(error: unknown) {
    this.update({ error: message(error) });
  }
  async hydrate(draftId?: string, lookId?: string) {
    if (this.hydration) await this.hydration;
    if (
      this.state.ready &&
      !this.state.error &&
      (!draftId || draftId === this.state.draft?.id) &&
      (!lookId || lookId === this.state.look?.id)
    )
      return;
    if (
      (draftId && draftId !== this.state.draft?.id) ||
      (lookId && lookId !== this.state.look?.id)
    ) {
      this.generation++;
      this.modeSelected = false;
      this.editor = null;
      this.cursors = {};
      this.update({
        ...initial,
        preferences: this.state.preferences,
        preferenceFingerprint: this.state.preferenceFingerprint,
      });
    }
    this.hydration = (async () => {
      this.update({ error: null });
      try {
        let recovery: z.infer<typeof recoverySchema> | null = null;
        try {
          const stored = recoverySchema.safeParse(
            JSON.parse(
              (draftId
                ? localStorage.getItem(`${this.key()}:draft:${draftId}`)
                : null) ??
                localStorage.getItem(this.key()) ??
                "null",
            ),
          );
          recovery = stored.success ? stored.data : null;
        } catch {
          /* Server IDs still restore when browser storage is unavailable. */
        }
        const sameRecovery =
          (!draftId || draftId === recovery?.draftId) &&
          (!lookId || lookId === recovery?.lookId);
        if (sameRecovery && recovery?.inventoryMode) {
          this.modeSelected = true;
          this.update({ inventoryMode: "combined" });
        }
        this.cursors = sameRecovery ? (recovery?.cursors ?? {}) : {};
        this.editor = sameRecovery ? (recovery?.editor ?? null) : null;
        this.update({ hasEditorDraft: Boolean(this.editor) });
        this.update({
          selectedDirection: sameRecovery
            ? (recovery?.selectedDirection ?? "closest")
            : "closest",
        });
        await readPreferences()
          .then((preferences) =>
            this.update({
              preferences: preferences.preferences,
              preferenceFingerprint: preferences.fingerprint,
            }),
          )
          .catch(() =>
            this.update({
              error:
                "Preferences could not be loaded. Your inspiration remains available.",
            }),
          );
        const id =
          draftId ??
          (!lookId || lookId === recovery?.lookId ? recovery?.draftId : null);
        if (id) {
          const draft = await createRequest(
            `/api/workflow-drafts/${id}`,
            draftSchema,
          );
          if (draft.status !== "active")
            throw new Error(
              "This draft was closed. Start a new inspiration to continue.",
            );
          if (lookId && draft.lookId !== lookId)
            throw new Error("This draft belongs to a different inspiration.");
          this.update({ draft });
          if (!this.editor && draft.payload.pieceDraft) {
            const { id: pieceId, ...values } = draft.payload.pieceDraft;
            const recoveredValues = Object.fromEntries(
              Object.entries(values).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            );
            this.editor = {
              pieceId: pieceId ?? draft.payload.activePieceId ?? null,
              values: recoveredValues,
            };
            this.update({ hasEditorDraft: true });
          }
          if (draft.lookId) {
            this.cursors = {};
            await this.reloadLook(draft.lookId, true);
          }
        } else if (lookId) {
          this.cursors = {};
          await this.reloadLook(lookId, true);
          if (this.state.look?.activeDraftId) {
            const draft = await createRequest(
              `/api/workflow-drafts/${this.state.look.activeDraftId}`,
              draftSchema,
            );
            if (draft.lookId === lookId && draft.status === "active")
              this.update({ draft });
          }
        }
        const activeDraft = this.state.draft;
        if (activeDraft && !this.editor) {
          try {
            const stored = recoverySchema.safeParse(
              JSON.parse(
                localStorage.getItem(`${this.key()}:draft:${activeDraft.id}`) ??
                  "null",
              ),
            );
            if (
              stored.success &&
              stored.data.draftId === activeDraft.id &&
              stored.data.lookId === this.state.look?.id
            ) {
              this.editor = stored.data.editor ?? null;
              if (stored.data.inventoryMode) this.modeSelected = true;
              this.update({
                selectedDirection: stored.data.selectedDirection,
                ...(stored.data.inventoryMode
                  ? { inventoryMode: "combined" }
                  : {}),
                hasEditorDraft: Boolean(this.editor),
              });
            }
          } catch {
            /* The server draft remains the recovery source when local storage fails. */
          }
          if (!this.editor && activeDraft.payload.pieceDraft) {
            const { id: pieceId, ...values } = activeDraft.payload.pieceDraft;
            this.editor = {
              pieceId: pieceId ?? activeDraft.payload.activePieceId ?? null,
              values: Object.fromEntries(
                Object.entries(values).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              ),
            };
            this.update({ hasEditorDraft: true });
          }
        }
        if (!this.state.look) {
          const file = await restorePendingFile(this.scope).catch(() => null);
          if (file) {
            this.temporaryUrl = URL.createObjectURL(file);
            this.update({
              file,
              previewUrl: this.temporaryUrl,
              uploadStatus: "failed",
            });
          }
        }
        this.remember();
      } catch (error) {
        this.report(error);
      } finally {
        this.update({ ready: true });
      }
    })();
    try {
      await this.hydration;
    } finally {
      this.hydration = null;
    }
  }
  async reloadLook(id = this.state.look?.id, activate = false) {
    if (!id) return;
    const generation = this.generation;
    const look = await createRequest(`/api/looks/${id}`, lookSchema);
    if (
      generation !== this.generation ||
      (!activate && this.state.look && this.state.look.id !== id)
    )
      return;
    if (
      this.state.look &&
      this.state.look.id === look.id &&
      look.revision < this.state.look.revision
    )
      return;
    this.update({
      look,
      ...(!this.modeSelected && look.inventoryMode
        ? { inventoryMode: "combined" }
        : {}),
      operations: look.operations,
      uploadStatus: "verified",
      previewUrl: look.inspirationImage?.url ?? null,
      ...(look.pieces.length ? { provisional: [] } : {}),
      ...(look.confidenceReview && !look.confidenceReview.stale
        ? { provisionalConfidence: null }
        : {}),
    });
    for (const kind of ["wardrobe_match", "outfit_options"]) {
      const stale =
        kind === "wardrobe_match"
          ? look.matches.some((match) => match.stale)
          : look.outfitOptions.some((option) => option.stale);
      if (stale)
        for (const key of this.prepared)
          if (key.startsWith(`${look.id}:`) && key.endsWith(`:${kind}`))
            this.prepared.delete(key);
    }
    this.remember();
    for (const operation of look.operations.filter(
      (op) =>
        op.inputRevision === look.revision &&
        op.assetId === look.inspirationImage?.assetId &&
        op.runtimeVersion === op.currentRuntimeVersion &&
        (active(op) ||
          (op.kind === "inspiration_description" &&
            op.status === "failed" &&
            !look.pieces.length &&
            !this.terminalReplays.has(`${this.generation}:${op.id}`))),
    )) {
      if (
        ![
          "inspiration_description",
          "inspiration_confidence",
          "wardrobe_match",
          "outfit_options",
          "option_regeneration",
        ].includes(operation.kind)
      )
        continue;
      if (active(operation)) this.execute(operation.id);
      else this.terminalReplays.add(`${this.generation}:${operation.id}`);
      this.observe(operation.id);
    }
  }
  async refresh() {
    try {
      this.update({ error: null });
      await this.reloadLook();
      const preferences = await readPreferences();
      this.update({
        preferences: preferences.preferences,
        preferenceFingerprint: preferences.fingerprint,
      });
    } catch (error) {
      this.report(error);
    }
  }
  async ensureDraft() {
    if (this.state.draft) return this.state.draft;
    if (!this.writesEnabled)
      throw new Error("Changes are disabled for this workspace.");
    if (this.draftCreation) return this.draftCreation;
    const generation = this.generation;
    this.draftCreation = (async () => {
      const draft = await createRequest("/api/workflow-drafts", draftSchema, {
        method: "POST",
        body: JSON.stringify({
          featureKind: "inspiration",
          payload: {},
          ...(this.state.look
            ? {
                lookId: this.state.look.id,
                assetId: this.state.look.inspirationImage?.assetId,
              }
            : {}),
        }),
      });
      if (generation === this.generation) {
        this.update({ draft });
        this.remember();
      }
      return draft;
    })();
    try {
      return await this.draftCreation;
    } finally {
      this.draftCreation = null;
    }
  }
  saveDraft(patch: Record<string, unknown>) {
    if (!this.writesEnabled)
      return Promise.reject(
        new Error("Changes are disabled for this workspace."),
      );
    const expectedId = this.state.draft?.id;
    const generation = this.generation;
    const next = this.draftQueue
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation)
          throw new Error(
            "The active inspiration changed. Reopen the original draft to apply this edit.",
          );
        const draft = await this.ensureDraft();
        if (
          generation !== this.generation ||
          (expectedId && draft.id !== expectedId)
        )
          throw new Error(
            "The active inspiration changed. Reopen the original draft to apply this edit.",
          );
        this.update({ draftStatus: "saving" });
        try {
          const saved = await createRequest(
            `/api/workflow-drafts/${draft.id}`,
            draftSchema,
            {
              method: "PATCH",
              keepalive: true,
              body: JSON.stringify({
                expectedRevision: draft.revision,
                ...patch,
              }),
            },
          );
          if (
            generation !== this.generation ||
            (expectedId && this.state.draft?.id !== expectedId)
          )
            return saved;
          this.update({ draft: saved, draftStatus: "saved" });
          this.remember();
          return saved;
        } catch (error) {
          if (generation === this.generation)
            this.update({ draftStatus: "failed" });
          throw error;
        } finally {
          if (
            generation !== this.generation &&
            this.state.draftStatus === "saving"
          )
            this.update({ draftStatus: "saved" });
        }
      });
    this.draftQueue = next;
    return next;
  }
  async visit(step: CreateStep) {
    if (!this.state.draft || !this.writesEnabled) return;
    const draft = this.state.draft;
    this.update({
      draft: {
        ...draft,
        currentStep: step,
        visitedSteps: [...new Set([...draft.visitedSteps, step])],
      },
    });
    await this.saveDraft({ currentStep: step, visitedSteps: [step] });
  }
  async upload(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024 ||
      file.size === 0
    )
      throw new Error("Choose a JPEG, PNG or WebP image up to 10 MiB.");
    const requestedGeneration = this.generation;
    try {
      let context: Promise<void>;
      let draft: Promise<unknown>;
      do {
        context = this.contextQueue;
        await context;
        draft = this.draftQueue;
        await draft;
      } while (context !== this.contextQueue || draft !== this.draftQueue);
    } catch (error) {
      this.report(error);
      throw error;
    }
    if (requestedGeneration !== this.generation) return;
    const generation = ++this.generation;
    const feedbackId = `inspiration-upload:${this.scope}:${generation}`;
    publishFeedback({
      id: feedbackId,
      label: "Inspiration photo",
      state: "running",
      detail: "Uploading and verifying the photo.",
    });
    this.update({
      error: null,
      file,
      uploadStatus: "uploading",
      provisional: [],
      provisionalConfidence: null,
    });
    if (this.temporaryUrl) URL.revokeObjectURL(this.temporaryUrl);
    this.temporaryUrl = URL.createObjectURL(file);
    this.update({ previewUrl: this.temporaryUrl });
    try {
      await retainPendingFile(this.scope, file);
      await this.draftQueue.catch(() => undefined);
      const draft = await this.ensureDraft();
      const upload = await createRequest(
        "/api/inspiration/uploads",
        z.object({
          assetId: z.uuid(),
          signedUrl: z.url(),
          mimeType: z.string(),
        }),
        {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            byteSize: file.size,
          }),
        },
      );
      const response = await fetch(upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": upload.mimeType },
        body: file,
      });
      if (!response.ok)
        throw new Error("The image upload did not finish. Retry the upload.");
      await this.draftQueue.catch(() => undefined);
      const attachingDraft =
        this.state.draft?.id === draft.id ? this.state.draft : draft;
      const verified = await createRequest(
        `/api/inspiration/uploads/${upload.assetId}/verify`,
        z.object({ lookId: z.uuid(), revision: z.number() }),
        {
          method: "POST",
          body: JSON.stringify({
            draftId: draft.id,
            expectedRevision: attachingDraft.revision,
            occasion: attachingDraft.payload.occasion ?? null,
          }),
        },
      );
      if (generation !== this.generation) return;
      const current = await createRequest(
        `/api/workflow-drafts/${draft.id}`,
        draftSchema,
      );
      if (generation !== this.generation) return;
      this.update({ draft: current, file: null });
      await this.reloadLook(verified.lookId, true);
      await retainPendingFile(this.scope, null);
      this.remember();
      publishFeedback({
        id: feedbackId,
        label: "Inspiration photo verified",
        state: "complete",
        detail: "Photo uploaded and verified.",
      });
    } catch (error) {
      if (generation === this.generation) {
        this.update({ uploadStatus: "failed" });
        publishFeedback({
          id: feedbackId,
          label: "Inspiration photo needs attention",
          state: "failed",
          detail: feedbackError(error),
        });
        this.report(error);
      }
      throw error;
    } finally {
      if (generation !== this.generation)
        publishFeedback({
          id: feedbackId,
          label: "Inspiration upload replaced",
          state: "superseded",
          detail:
            "A newer upload or draft is active. Open it to check progress.",
        });
    }
  }
  setOccasion(occasion: string | null) {
    const generation = this.generation;
    const intent = ++this.contextIntent;
    this.update({ contextSaving: true });
    const request = this.contextQueue
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation) return;
        await this.applyOccasion(occasion);
      })
      .finally(() => {
        if (intent === this.contextIntent)
          this.update({ contextSaving: false });
      });
    this.contextQueue = request;
    return request;
  }
  private async applyOccasion(occasion: string | null) {
    const generation = this.generation;
    const look = this.state.look;
    if (look) {
      await createRequest(
        `/api/looks/${look.id}/context`,
        z.object({
          lookId: z.uuid(),
          revision: z.number(),
          occasion: z.string().nullable(),
          changed: z.boolean(),
        }),
        {
          method: "PATCH",
          body: JSON.stringify({ expectedRevision: look.revision, occasion }),
        },
      );
      if (generation !== this.generation) return;
      await this.reloadLook(look.id);
    }
    if (generation !== this.generation) return;
    await this.saveDraft({
      payload: { ...this.state.draft?.payload, occasion },
    });
  }
  start(kind: string, force = false) {
    if (!this.writesEnabled) return Promise.resolve();
    const mode = "combined";
    const key = `${this.state.look?.id}:${this.state.look?.revision}:${this.state.preferenceFingerprint}:${mode}:${kind}`;
    const existing = this.starting.get(key);
    if (existing) return existing;
    if (!force && this.prepared.has(key)) return Promise.resolve();
    this.prepared.add(key);
    this.update({ error: null });
    const generation = this.generation;
    const request = (async () => {
      try {
        const draft = await this.ensureDraft();
        if (generation !== this.generation) return;
        if (!draft.lookId)
          throw new Error("Verify an inspiration image first.");
        const operation = await createRequest(
          `/api/workflow-drafts/${draft.id}/operations`,
          operationSchema,
          {
            method: "POST",
            body: JSON.stringify({
              kind,
              inventoryMode: mode,
              execute: false,
            }),
          },
        );
        if (
          generation === this.generation &&
          this.state.look?.id === draft.lookId
        )
          this.mergeOperation(operation);
        if (
          active(operation) &&
          generation === this.generation &&
          this.state.look?.id === draft.lookId
        ) {
          this.execute(operation.id, { generation, lookId: draft.lookId });
          if (generation === this.generation) this.observe(operation.id);
        }
      } catch (error) {
        this.prepared.delete(key);
        if (generation === this.generation) this.report(error);
      } finally {
        this.starting.delete(key);
      }
    })();
    this.starting.set(key, request);
    return request;
  }
  private mergeOperation(operation: CreateOperation) {
    if (
      operation.kind === "inspiration_description" &&
      active(operation) &&
      operation.id !== this.provisionalSource
    ) {
      this.provisionalSource = operation.id;
      this.update({ provisional: [] });
    }
    this.update({
      operations: [
        operation,
        ...this.state.operations.filter((item) => item.id !== operation.id),
      ],
    });
  }
  private execute(
    id: string,
    owner: { generation: number; lookId: string | undefined | null } = {
      generation: this.generation,
      lookId: this.state.look?.id,
    },
  ) {
    if (!this.writesEnabled) return;
    if (this.executions.has(id)) return;
    const { generation, lookId } = owner;
    const request = (async () => {
      try {
        const response = await startOperationRequest(
          id,
          `/api/workflow-operations/${id}/execute`,
        );
        const body: unknown = await response.json();
        if (!response.ok)
          throw new Error(
            "The analysis request could not finish. Check its status and retry.",
          );
        const result = z.object({ data: operationSchema }).parse(body).data;
        if (generation === this.generation && lookId === this.state.look?.id) {
          this.mergeOperation(result);
          await this.reloadLook();
        }
      } catch (error) {
        if (generation === this.generation) this.report(error);
      } finally {
        this.executions.delete(id);
        if (generation === this.generation && lookId === this.state.look?.id)
          this.observe(id);
      }
    })();
    this.executions.set(id, request);
  }
  private observe(id: string) {
    if (this.observing.has(id)) return;
    this.observing.add(id);
    const generation = this.generation;
    const lookId = this.state.look?.id;
    const follow = async () => {
      try {
        let failures = 0;
        while (
          generation === this.generation &&
          lookId === this.state.look?.id
        ) {
          try {
            const events = await createRequest(
              `/api/workflow-operations/${id}/events?after=${this.cursors[id] ?? 0}`,
              eventsSchema,
            );
            if (
              generation !== this.generation ||
              lookId !== this.state.look?.id
            )
              break;
            for (const event of events) {
              this.cursors[id] = Math.max(
                this.cursors[id] ?? 0,
                event.sequence,
              );
              if (event.sourceRevision !== this.state.look?.revision) continue;
              if (event.type === "piece_completed") {
                const value = z
                  .object({ piece: garmentSchema.safeExtend({ id: z.uuid() }) })
                  .safeParse(event.payload);
                if (
                  value.success &&
                  this.currentOperation("inspiration_description")?.id === id
                ) {
                  if (this.provisionalSource !== id) {
                    this.provisionalSource = id;
                    this.update({ provisional: [] });
                  }
                  this.update({
                    provisional: [
                      ...this.state.provisional.filter(
                        (piece) => piece.id !== value.data.piece.id,
                      ),
                      value.data.piece,
                    ],
                  });
                }
              } else if (event.type === "confidence_completed") {
                const value = z
                  .object({ review: confidenceSchema })
                  .safeParse(event.payload);
                if (
                  value.success &&
                  this.currentOperation("inspiration_confidence")?.id === id
                )
                  this.update({ provisionalConfidence: value.data.review });
              }
            }
            this.remember();
            const operation = await createRequest(
              `/api/workflow-operations/${id}`,
              operationSchema,
            );
            if (
              generation !== this.generation ||
              lookId !== this.state.look?.id
            )
              break;
            this.mergeOperation(operation);
            failures = 0;
            if (!active(operation)) {
              if (
                operation.kind === "inspiration_description" &&
                this.currentOperation("inspiration_description")?.id === id &&
                operation.status !== "failed"
              )
                this.update({ provisional: [] });
              if (
                operation.kind === "inspiration_confidence" &&
                this.currentOperation("inspiration_confidence")?.id === id
              )
                this.update({ provisionalConfidence: null });
              await this.reloadLook();
              break;
            }
          } catch (error) {
            if (++failures >= 3) {
              if (generation === this.generation) this.report(error);
              break;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      } finally {
        this.observing.delete(id);
      }
    };
    void follow();
  }
  async retry(operation: CreateOperation) {
    if (!this.writesEnabled) return;
    if (!operation.canRetry) {
      if (operation.canRestart) return this.start(operation.kind, true);
      this.report(
        new Error(
          "This analysis cannot be retried with the same inputs. Review the photo or add pieces manually.",
        ),
      );
      return;
    }
    const generation = this.generation;
    try {
      const task = (async () => {
        const result = await createRequest(
          `/api/workflow-operations/${operation.id}/retry`,
          operationSchema,
          { method: "POST" },
        );
        if (generation === this.generation) {
          this.mergeOperation(result);
          await this.reloadLook();
        }
      })();
      this.executions.set(operation.id, task);
      this.observe(operation.id);
      await task;
    } catch (error) {
      if (generation === this.generation) this.report(error);
    } finally {
      this.executions.delete(operation.id);
    }
  }
  async cancel(operation: CreateOperation) {
    if (!this.writesEnabled) return;
    const generation = this.generation;
    try {
      const result = await createRequest(
        `/api/workflow-operations/${operation.id}/cancel`,
        operationSchema,
        { method: "POST" },
      );
      if (generation === this.generation) {
        this.mergeOperation(result);
        await this.reloadLook();
      }
    } catch (error) {
      if (generation === this.generation) this.report(error);
    }
  }
  async regenerate(
    type: "closest" | "from_wardrobe" | "fresh_alternative",
    intentId = crypto.randomUUID(),
  ) {
    if (!this.writesEnabled) return;
    const generation = this.generation;
    const look = this.state.look;
    const option = look?.outfitOptions.find((item) => item.optionType === type);
    if (!look || !option) return;
    const allocationKey = `${look.id}:${option.id}`;
    if (
      this.regenerationAllocations.has(allocationKey) ||
      this.state.operations.some(
        (operation) =>
          operation.kind === "option_regeneration" &&
          operation.subjectId === option.id &&
          active(operation),
      )
    )
      return;
    this.regenerationAllocations.add(allocationKey);
    try {
      const op = await createRequest(
        `/api/looks/${look.id}/outfit-options/${type}/regenerate`,
        operationSchema,
        {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: look.revision,
            expectedOptionId: option.id,
            inventoryMode: "combined",
            intentId,
            execute: false,
          }),
        },
      );
      if (generation === this.generation) this.mergeOperation(op);
      if (active(op)) {
        this.execute(op.id, { generation, lookId: look.id });
        if (generation === this.generation) this.observe(op.id);
      }
    } catch (error) {
      if (generation === this.generation) this.report(error);
    } finally {
      this.regenerationAllocations.delete(allocationKey);
    }
  }
  selectDirection(direction: SessionState["selectedDirection"]) {
    this.update({ selectedDirection: direction });
    this.remember();
  }
  setInventoryMode(inventoryMode: "live" | "sample" | "combined") {
    if (
      !this.writesEnabled ||
      [...this.starting.keys()].some((key) =>
        ["wardrobe_match", "outfit_options"].some((kind) =>
          key.endsWith(`:${kind}`),
        ),
      ) ||
      Boolean(
        this.state.look?.matches.length ||
        this.state.look?.outfitOptions.length,
      ) ||
      this.state.operations.some((operation) =>
        ["wardrobe_match", "outfit_options", "option_regeneration"].includes(
          operation.kind,
        ),
      )
    )
      return;
    this.modeSelected = true;
    this.update({ inventoryMode });
    this.remember();
  }
  getEditor(pieceId: string | null) {
    if (this.editor?.pieceId !== pieceId) return null;
    const parsed = inspirationPayloadSchema.safeParse({
      pieceDraft: this.editor.values,
    });
    return parsed.success ? (parsed.data.pieceDraft ?? null) : null;
  }
  editorPieceId() {
    return this.editor?.pieceId ?? null;
  }
  async discardEditor() {
    const generation = this.generation;
    if (this.state.draft)
      await this.saveDraft({
        payload: {
          occasion: this.state.draft.payload.occasion ?? null,
          activePieceId: null,
          pieceDraft: null,
        },
      });
    if (generation !== this.generation) return;
    this.editor = null;
    this.update({ hasEditorDraft: false });
    this.remember();
  }
  retainEditor(pieceId: string | null, values: PieceEditValues) {
    this.editor = { pieceId, values };
    this.update({ hasEditorDraft: true });
    this.remember();
  }
  saveEditor(pieceId: string | null, values: PieceEditValues) {
    this.editor = { pieceId, values };
    this.remember();
    const payload = {
      ...this.state.draft?.payload,
      activePieceId: pieceId,
      pieceDraft: { ...(pieceId ? { id: pieceId } : {}), ...values },
    };
    return this.saveDraft({ payload });
  }
  async savePieces(
    pieces: Array<
      z.input<typeof garmentSchema> & {
        id?: string;
        adoptedFromPieceId?: string;
      }
    >,
  ) {
    const generation = this.generation;
    const retainedEditor = this.editor;
    const look = this.state.look;
    if (!look) throw new Error("Load the inspiration before editing pieces.");
    const payload = pieces.map((piece) => ({
      ...(piece.id ? { id: piece.id } : {}),
      ...(piece.adoptedFromPieceId
        ? { adoptedFromPieceId: piece.adoptedFromPieceId }
        : {}),
      name: piece.name,
      category: piece.category,
      subcategory: piece.subcategory,
      description: piece.description,
      attributes: piece.attributes,
      observations: piece.observations,
      confidence: piece.confidence,
      uncertainty: piece.uncertainty,
    }));
    await createRequest(
      `/api/looks/${look.id}/pieces`,
      z.object({ lookId: z.uuid(), revision: z.number() }),
      {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: look.revision,
          pieces: payload,
        }),
      },
    );
    if (generation !== this.generation || this.state.look?.id !== look.id)
      return;
    this.editor = null;
    this.update({ provisional: [], hasEditorDraft: false });
    await this.reloadLook();
    if (generation !== this.generation || this.state.look?.id !== look.id)
      return;
    await this.saveDraft({
      payload: {
        occasion: this.state.draft?.payload.occasion ?? null,
        activePieceId: null,
        pieceDraft: null,
      },
    }).catch(() => {
      if (generation !== this.generation) return;
      this.editor = retainedEditor;
      this.update({
        hasEditorDraft: Boolean(
          retainedEditor || this.state.draft?.payload.pieceDraft,
        ),
      });
      this.report(
        new Error(
          "The pieces were saved, but their edit draft could not be cleared. Reload current data before continuing.",
        ),
      );
    });
  }
  async discard() {
    this.generation++;
    const generation = this.generation;
    const discardedId = this.state.draft?.id;
    await this.draftQueue.catch(() => undefined);
    if (this.state.draft) await this.saveDraft({ status: "discarded" });
    if (generation !== this.generation) return;
    await retainPendingFile(this.scope, null);
    if (generation !== this.generation) return;
    this.editor = null;
    this.cursors = {};
    this.modeSelected = false;
    if (this.temporaryUrl) URL.revokeObjectURL(this.temporaryUrl);
    this.update({
      ...initial,
      ready: true,
      preferences: this.state.preferences,
      preferenceFingerprint: this.state.preferenceFingerprint,
    });
    localStorage.removeItem(this.key());
    if (discardedId)
      localStorage.removeItem(`${this.key()}:draft:${discardedId}`);
  }
  currentOperation(kind: string) {
    return this.state.operations.find(
      (op) =>
        op.kind === kind &&
        op.runtimeVersion === op.currentRuntimeVersion &&
        (!op.currentInputFingerprint ||
          !op.inputFingerprint ||
          op.currentInputFingerprint === op.inputFingerprint) &&
        op.inputRevision === this.state.look?.revision &&
        (!op.assetId ||
          op.assetId === this.state.look?.inspirationImage?.assetId) &&
        (!["wardrobe_match", "outfit_options"].includes(kind) ||
          op.inventoryMode === this.state.inventoryMode),
    );
  }
}
const sessions = new Map<string, CreateSession>();
export function getCreateSession(scope: string) {
  let session = sessions.get(scope);
  if (!session) {
    session = new CreateSession(scope);
    sessions.set(scope, session);
  }
  return session;
}
export function useCreateSession(scope: string) {
  const session = getCreateSession(scope);
  const state = useSyncExternalStore(
    session.subscribe,
    session.snapshot,
    session.serverSnapshot,
  );
  return { session, state };
}
export function canonicalEdit(
  piece: ProvisionalPiece | undefined,
  values: PieceEditValues,
) {
  const attributes: CanonicalPiece["attributes"] =
    piece?.category === values.category ? { ...piece.attributes } : {};
  for (const key of [
    "apparentMaterial",
    "pattern",
    "texture",
    "fit",
    "cut",
    "length",
    "occasion",
  ] as const)
    attributes[key] = values[key].trim() || null;
  const colors = values.colors
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const oldColors =
    piece?.attributes.colors ??
    (piece?.attributes.primaryColor ? [piece.attributes.primaryColor] : []);
  if (
    !piece ||
    piece.category !== values.category ||
    JSON.stringify(colors) !== JSON.stringify(oldColors)
  ) {
    attributes.colors = colors;
    attributes.primaryColor = colors[0] ?? null;
    for (const key of [
      "dominantHex",
      "colorFamily",
      "colorTemperature",
      "colorValue",
      "colorChroma",
      "contrastLevel",
    ] as const)
      attributes[key] = null;
    attributes.accentHex = null;
    attributes.secondaryColors = null;
  }
  attributes.styleTags = values.styleTags
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return garmentSchema.safeExtend({ id: z.uuid().optional() }).parse({
    ...(piece ? { id: piece.id } : {}),
    name: values.name,
    category: values.category,
    subcategory: piece?.category === values.category ? piece.subcategory : null,
    description: piece?.description ?? values.name,
    attributes,
    observations: piece?.observations ?? [],
    confidence: piece?.confidence ?? null,
    uncertainty: piece?.uncertainty ?? [],
  });
}
