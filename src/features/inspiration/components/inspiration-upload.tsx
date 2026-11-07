"use client";

import { useRef, useState } from "react";
import { Badge, Button, Chip, Icon } from "@/components/ui";

export type UploadTaskStatus = {
  label: string;
  detail?: string;
  progressFraction?: number;
  status: "queued" | "running" | "ready" | "failed";
};

export type UploadPreferenceSummary = {
  undertone?: string | null;
  skinTone?: string | null;
  bodyShape?: string | null;
  fitGoal?: string | null;
};

export type InspirationUploadProps = {
  imageUrl?: string | null;
  imageAlt?: string;
  fileName?: string | null;
  fileSizeLabel?: string | null;
  status?: "empty" | "uploading" | "verified" | "failed";
  errorMessage?: string | null;
  occasion?: string | null;
  occasions?: readonly string[];
  preferences?: UploadPreferenceSummary | null;
  tasks?: UploadTaskStatus[];
  analyzeDisabled?: boolean;
  onChooseFile: (file: File) => void;
  onRemove?: () => void;
  onOccasionChange?: (occasion: string | null) => void;
  onPreferences?: () => void;
  onAnalyze?: () => void;
  onRetry?: () => void;
};

const defaultOccasions = [
  "Everyday",
  "Work",
  "Evening",
  "Travel",
  "Weekend",
  "Event",
];

function UploadTask({ task }: { task: UploadTaskStatus }) {
  return (
    <div
      className="min-w-0 rounded-xl bg-porcelain p-3"
      aria-live={task.status === "failed" ? "polite" : "off"}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-semibold text-ink">
          <Icon
            name={
              task.status === "failed"
                ? "info"
                : task.status === "ready"
                  ? "check"
                  : "sparkle"
            }
            className="size-4 text-crimson"
          />
          {task.label}
        </span>
        <span className="text-right text-secondary">
          {task.detail ??
            (task.status === "ready"
              ? "Ready"
              : task.status === "failed"
                ? "Needs retry"
                : "In progress")}
        </span>
      </div>
      {task.status === "running" && task.progressFraction != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand">
          <div
            className="h-full rounded-full bg-crimson"
            style={{
              width: `${Math.max(0, Math.min(1, task.progressFraction)) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export function UploadPreferenceCard({
  preferences,
  onPreferences,
}: {
  preferences?: UploadPreferenceSummary | null;
  onPreferences?: () => void;
}) {
  const hasSelections = Boolean(
    preferences && Object.values(preferences).some(Boolean),
  );
  return (
    <section
      className="rounded-[20px] border border-rose-wash bg-blush p-5 sm:p-6"
      aria-labelledby="upload-preference-title"
    >
      <div className="flex items-center gap-2">
        <Icon name="sliders" className="size-5 text-crimson" />
        <h2 id="upload-preference-title" className="font-semibold text-ink">
          {hasSelections
            ? "Your style profile"
            : "Make the ideas feel like you"}
        </h2>
        {hasSelections && <Badge tone="owned">Set</Badge>}
      </div>
      <p className="mt-3 text-sm leading-6 text-secondary">
        {hasSelections
          ? "Used for color and fit advice and for your avatar. Never guessed from the photo."
          : "Set your skin tone, undertone and body shape for color and fit advice. Optional, never guessed from photos."}
      </p>
      {hasSelections ? (
        <div className="mt-4 space-y-2.5">
          {preferences?.undertone && (
            <div className="flex min-h-14 items-center gap-3 rounded-xl bg-paper px-3">
              <span className="flex -space-x-1" aria-hidden="true">
                <span className="size-5 rounded-full border border-paper bg-camel" />
                <span className="size-5 rounded-full border border-paper bg-crimson" />
                <span className="size-5 rounded-full border border-paper bg-sage" />
              </span>
              <span>
                <span className="block text-xs text-secondary">Undertone</span>
                <strong className="text-sm font-medium">
                  {preferences.undertone}
                </strong>
              </span>
            </div>
          )}
          {preferences?.skinTone && (
            <div className="flex min-h-14 items-center gap-3 rounded-xl bg-paper px-3">
              <span
                className="size-6 rounded-full bg-camel"
                aria-hidden="true"
              />
              <span>
                <span className="block text-xs text-secondary">Skin tone</span>
                <strong className="text-sm font-medium">
                  {preferences.skinTone}
                </strong>
              </span>
            </div>
          )}
          {preferences?.bodyShape && (
            <div className="flex min-h-14 items-center gap-3 rounded-xl bg-paper px-3">
              <Icon name="user" className="size-6 text-crimson" />
              <span>
                <span className="block text-xs text-secondary">Body shape</span>
                <strong className="text-sm font-medium">
                  {preferences.bodyShape}
                  {preferences.fitGoal ? `, ${preferences.fitGoal}` : ""}
                </strong>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-paper p-3">
            <span className="mx-auto mb-2 block size-6 rounded-full bg-sage" />
            Undertone
          </div>
          <div className="rounded-xl bg-paper p-3">
            <span className="mx-auto mb-2 block size-6 rounded-full bg-camel" />
            Skin tone
          </div>
          <div className="rounded-xl bg-paper p-3">
            <Icon name="user" className="mx-auto mb-2 size-6 text-crimson" />
            Body shape
          </div>
        </div>
      )}
      {onPreferences && (
        <Button
          type="button"
          variant="secondary"
          onClick={onPreferences}
          className="mt-4 w-full sm:w-auto"
        >
          {hasSelections ? "Edit preferences" : "Set preferences"}
        </Button>
      )}
    </section>
  );
}

export function InspirationUpload({
  imageUrl,
  imageAlt = "Selected outfit inspiration",
  fileName,
  fileSizeLabel,
  status = "empty",
  errorMessage,
  occasion,
  occasions = defaultOccasions,
  preferences,
  tasks = [],
  analyzeDisabled,
  onChooseFile,
  onRemove,
  onOccasionChange,
  onPreferences,
  onAnalyze,
  onRetry,
}: InspirationUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const canAnalyze = status === "verified" && !analyzeDisabled;
  const openPicker = () => inputRef.current?.click();

  return (
    <section
      className="mx-auto w-full max-w-[1150px] pb-8"
      aria-labelledby="inspiration-upload-title"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-crimson">Step 1 of 5</p>
          <h1
            id="inspiration-upload-title"
            className="mt-2 font-serif text-[clamp(2.2rem,4vw,3.2rem)] leading-tight"
          >
            Begin with an <em className="text-crimson">inspiration.</em>
          </h1>
          <p className="mt-2 max-w-[620px] text-base leading-6 text-secondary">
            Upload an outfit you saved. We describe each piece, check what you
            already own and suggest three ways to wear it.
          </p>
        </div>
        {onAnalyze && (
          <div className="hidden text-right sm:block">
            <Button
              type="button"
              variant="primary"
              onClick={onAnalyze}
              disabled={!canAnalyze}
            >
              Analyze inspiration
            </Button>
            <p className="mt-2 text-xs text-secondary">
              Reading starts when the image is ready
            </p>
          </div>
        )}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.68fr)_minmax(320px,1fr)] lg:gap-5">
        <div className="rounded-[20px] border border-stone bg-paper p-3 sm:p-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choose an outfit inspiration image"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                if (
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  setFileError("Choose a JPEG, PNG or WebP image.");
                } else if (file.size > 10 * 1024 * 1024) {
                  setFileError("Choose an image smaller than 10 MiB.");
                } else {
                  setFileError(null);
                  onChooseFile(file);
                }
              }
              event.target.value = "";
            }}
          />
          <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl bg-sand p-3 sm:min-h-[520px]">
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={imageAlt}
                  className="max-h-[500px] max-w-full rounded-xl object-contain"
                />
              </>
            ) : (
              <div className="max-w-xs text-center">
                <Icon name="image" className="mx-auto size-12 text-secondary" />
                <p className="mt-3 font-semibold">Choose an outfit image</p>
                <p className="mt-2 text-sm text-secondary">
                  JPEG, PNG or WebP up to 10 MiB. A full-length daylight photo
                  usually gives clearer details.
                </p>
              </div>
            )}
            {status === "verified" && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-[var(--color-owned)]">
                <Icon name="check" className="size-3.5" />
                Uploaded and verified
              </span>
            )}
            {status === "uploading" && (
              <span className="absolute left-3 top-3 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink">
                Uploading image…
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={openPicker}
              className="flex-1 sm:flex-none"
            >
              {imageUrl ? "Replace image" : "Choose image"}
            </Button>
            {onAnalyze && (
              <Button
                type="button"
                variant="primary"
                onClick={onAnalyze}
                disabled={!canAnalyze}
                className="flex-1 sm:hidden"
              >
                Analyze inspiration
              </Button>
            )}
            {imageUrl && onRemove && (
              <Button
                type="button"
                variant="quiet"
                onClick={onRemove}
                className="w-full sm:w-auto"
              >
                Remove
              </Button>
            )}
            <span className="min-w-0 w-full text-xs text-secondary sm:w-auto">
              {fileName
                ? `${fileName}${fileSizeLabel ? `, ${fileSizeLabel}` : ""}`
                : "JPEG, PNG or WebP up to 10 MiB"}
            </span>
          </div>
          {fileError && (
            <p
              className="mt-2 text-sm text-[var(--color-missing)]"
              role="alert"
            >
              {fileError}
            </p>
          )}
          {status === "failed" && (
            <div
              className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-[var(--color-missing-bg)] px-3 py-2 text-sm text-[var(--color-missing)]"
              role="alert"
            >
              <Icon name="info" className="size-4" />
              <span>{errorMessage ?? "The image could not be uploaded."}</span>
              {onRetry && (
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={onRetry}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {tasks.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {tasks.map((task) => (
                <UploadTask key={task.label} task={task} />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <section
            className="rounded-[20px] border border-stone bg-paper p-5 sm:p-6"
            aria-labelledby="upload-occasion-title"
          >
            <h2 id="upload-occasion-title" className="text-lg font-semibold">
              Where will you wear it?
            </h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Optional. Changing it refreshes only the advice that depends on
              it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {occasions.map((choice) => (
                <Chip
                  key={choice}
                  selected={occasion === choice}
                  onClick={() =>
                    onOccasionChange?.(occasion === choice ? null : choice)
                  }
                >
                  {choice}
                </Chip>
              ))}
            </div>
          </section>
          <UploadPreferenceCard
            preferences={preferences}
            onPreferences={onPreferences}
          />
          <p className="flex gap-2 px-1 text-xs leading-5 text-secondary">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            Full-length photos in daylight give the most accurate descriptions.
            We never recreate the person in the photo.
          </p>
        </div>
      </div>
    </section>
  );
}
