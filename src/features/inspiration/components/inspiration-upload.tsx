"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Badge, Button, Chip, Icon } from "@/components/ui";
import styles from "./create-presentation.module.css";

export type UploadTaskStatus = {
  label: string;
  detail?: string;
  progressFraction?: number;
  status: "queued" | "running" | "ready" | "failed";
};

export type UploadPreferenceSummary = {
  undertone?: string | null;
  skinTone?: string | null;
  skinToneHex?: string | null;
  bodyShape?: string | null;
  bodyImageUrl?: string | null;
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
  readOnly?: boolean;
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
                : task.status === "queued"
                  ? "Queued"
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
    preferences &&
    [
      preferences.undertone,
      preferences.skinTone,
      preferences.bodyShape,
      preferences.fitGoal,
    ].some(Boolean),
  );
  const undertone = ["warm", "cool", "neutral", "olive", "unsure"].find(
    (value) => preferences?.undertone?.toLowerCase().startsWith(value),
  );
  return (
    <section
      className={styles.preferenceCard}
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
      <p className="mt-3 text-sm leading-5 text-secondary">
        {hasSelections
          ? "Used for color and fit advice and for your avatar. Never guessed from the photo."
          : "Set your skin tone, undertone and body shape for color and fit advice. Optional, never guessed from photos."}
      </p>
      {hasSelections ? (
        <div className="mt-4 space-y-2.5">
          {preferences?.undertone && (
            <div className="flex min-h-14 items-center gap-3 rounded-xl bg-paper px-3">
              {undertone && (
                <Image
                  src={`/design/preferences/undertone-${undertone}.svg`}
                  alt=""
                  width={60}
                  height={24}
                  className="h-6 w-[60px] rounded object-cover"
                />
              )}
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
                className="size-7 shrink-0 rounded-full border border-stone bg-porcelain"
                style={
                  preferences.skinToneHex
                    ? { backgroundColor: preferences.skinToneHex }
                    : undefined
                }
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
              {preferences.bodyImageUrl ? (
                <Image
                  src={preferences.bodyImageUrl}
                  alt=""
                  width={28}
                  height={40}
                  className="h-10 w-7 shrink-0 object-contain"
                />
              ) : (
                <Icon name="user" className="size-7 text-crimson" />
              )}
              <span>
                <span className="block text-xs text-secondary">Body shape</span>
                <strong className="text-sm font-medium">
                  {preferences.bodyShape}
                  {preferences.fitGoal ? `, ${preferences.fitGoal}` : ""}
                </strong>
              </span>
            </div>
          )}
          {!preferences?.bodyShape && preferences?.fitGoal && (
            <div className="flex min-h-14 items-center gap-3 rounded-xl bg-paper px-3">
              <Icon name="shirt" className="size-7 text-crimson" />
              <span>
                <span className="block text-xs text-secondary">Fit goal</span>
                <strong className="text-sm font-medium">
                  {preferences.fitGoal}
                </strong>
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-paper p-3">
            <Image
              src="/design/preferences/undertone-warm.svg"
              alt=""
              width={44}
              height={18}
              className="mx-auto mb-2 h-[18px] w-11 rounded object-cover"
            />
            Undertone
          </div>
          <div className="rounded-xl bg-paper p-3">
            <span
              className="mx-auto mb-2 flex h-[18px] items-center justify-center -space-x-1"
              aria-hidden="true"
            >
              {["02", "04", "06"].map((depth) => (
                <Image
                  key={depth}
                  src={`/design/preferences/skin-depth-${depth}.svg`}
                  alt=""
                  width={18}
                  height={18}
                />
              ))}
            </span>
            Skin tone
          </div>
          <div className="rounded-xl bg-paper p-3">
            <Image
              src="/design/preferences/body-rectangle.svg"
              alt=""
              width={14}
              height={18}
              className="mx-auto mb-2 h-[18px] w-[14px] object-contain"
            />
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
  readOnly = false,
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
  const pickerDisabled = readOnly || status === "uploading";
  const openPicker = () => {
    if (!pickerDisabled) inputRef.current?.click();
  };

  return (
    <section className={styles.page} aria-labelledby="inspiration-upload-title">
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.stepLabel}>Step 1 of 5</p>
          <h1 id="inspiration-upload-title" className={styles.heading}>
            Begin with an <em className="text-crimson">inspiration.</em>
          </h1>
          <p className={styles.desktopDescription}>
            Upload an outfit and choose an occasion. Stylora reads its pieces
            automatically, then helps match your wardrobe and explore three
            outfits.
          </p>
        </div>
        {onAnalyze && (
          <div className={styles.desktopAction}>
            <Button
              type="button"
              variant="primary"
              onClick={onAnalyze}
              disabled={!canAnalyze}
            >
              Analyze inspiration
            </Button>
            <p className="mt-2 text-xs text-secondary">
              {tasks.some((task) => task.status === "running")
                ? "Analysis is in progress"
                : "Analysis starts after your photo is verified and an occasion is selected"}
            </p>
          </div>
        )}
      </div>
      <div className={styles.uploadGrid}>
        <div className={styles.uploadCard}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={pickerDisabled}
            tabIndex={-1}
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
          <button
            type="button"
            className={styles.uploadImageWell}
            onClick={openPicker}
            disabled={pickerDisabled}
            aria-label={
              imageUrl
                ? "Replace outfit inspiration image"
                : "Choose an outfit inspiration image"
            }
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={imageAlt}
                width={600}
                height={800}
                unoptimized
                className={styles.uploadImage}
              />
            ) : (
              <span className="block max-w-xs text-center">
                <Icon name="image" className="mx-auto size-12 text-secondary" />
                <span className="mt-3 block font-semibold">
                  Choose an outfit image
                </span>
                <span className="mt-2 block text-sm text-secondary">
                  JPEG, PNG or WebP up to 10 MiB. A full-length daylight photo
                  usually gives clearer details.
                </span>
              </span>
            )}
            {status === "verified" && (
              <span
                className={`${styles.verifiedBadge} absolute left-4 top-4 items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-[var(--color-owned)]`}
              >
                <Icon name="check" className="size-3.5" />
                Uploaded and verified
              </span>
            )}
            {status === "uploading" && (
              <span className="absolute left-3 top-3 rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-ink">
                Uploading image…
              </span>
            )}
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={openPicker}
              disabled={pickerDisabled}
              className="flex-1 sm:flex-none"
            >
              {imageUrl ? (
                <>
                  <span className="sm:hidden">Replace</span>
                  <span className="hidden sm:inline">Replace image</span>
                </>
              ) : (
                "Choose image"
              )}
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
                disabled={readOnly}
                className="hidden sm:inline-flex"
              >
                Remove
              </Button>
            )}
            <span className="hidden min-w-0 flex-1 text-right text-xs text-secondary sm:block">
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
                  disabled={readOnly}
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {tasks.length > 0 && (
            <>
              <div className="mt-3 hidden gap-3 sm:grid sm:grid-cols-2">
                {tasks.map((task) => (
                  <UploadTask key={task.label} task={task} />
                ))}
              </div>
              <div
                className="mt-3 flex items-start gap-2 rounded-xl bg-porcelain px-3 py-2.5 text-xs leading-4 sm:hidden"
                aria-live="polite"
              >
                <Icon
                  name="sparkle"
                  className="mt-0.5 size-3.5 shrink-0 text-crimson"
                />
                <p>
                  {tasks
                    .map(
                      (task) =>
                        `${task.label}: ${task.detail ?? (task.status === "ready" ? "ready" : task.status === "failed" ? "needs retry" : task.status === "queued" ? "queued" : "in progress")}`,
                    )
                    .join(". ")}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 space-y-4 lg:space-y-5">
          <section
            className={styles.occasionCard}
            aria-labelledby="upload-occasion-title"
          >
            <h2 id="upload-occasion-title" className="text-base font-semibold">
              Where will you wear it?
            </h2>
            <p className="mt-3 hidden text-sm leading-5 text-secondary sm:block">
              Optional. Changing it refreshes only the advice that depends on
              it.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {occasions.map((choice) => (
                <Chip
                  key={choice}
                  selected={occasion === choice}
                  disabled={readOnly || !onOccasionChange}
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
          <p className="hidden gap-2 px-1 text-xs leading-5 text-secondary sm:flex">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            Full-length photos in daylight give the most accurate descriptions.
            We never recreate the person in the photo.
          </p>
        </div>
      </div>
    </section>
  );
}
