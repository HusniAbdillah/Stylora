"use client";

import Image from "next/image";
import { useId, useState, type ReactNode } from "react";
import { Button, Icon } from "@/components/ui";

export type PreviewCategory =
  "top" | "bottom" | "dress" | "outerwear" | "shoes" | "bags" | "accessories";
export type PreviewItem = {
  id: string;
  name: string;
  category: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
  subcategory?: string | null;
  imageUrl?: string | null;
  inventoryStatus: "owned" | "saved_candidate";
};
export type PreviewSelection = Partial<Record<PreviewCategory, string>>;
export type PreviewJob = {
  status:
    | "idle"
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "unavailable"
    | "cancelled";
  superseded?: boolean;
  imageUrl?: string | null;
  elapsedSeconds?: number;
  errorMessage?: string;
};

const CATEGORIES: { key: PreviewCategory; label: string }[] = [
  { key: "top", label: "Tops" },
  { key: "bottom", label: "Bottoms" },
  { key: "dress", label: "Dresses" },
  { key: "outerwear", label: "Outerwear" },
  { key: "shoes", label: "Shoes" },
  { key: "bags", label: "Bags" },
  { key: "accessories", label: "Accessories" },
];

function slotForItem(item: PreviewItem): PreviewCategory {
  if (item.category !== "accessory") return item.category;
  return /bag|tote|clutch|backpack|purse|satchel|duffel|briefcase|crossbody|messenger/i.test(
    item.subcategory ?? "",
  )
    ? "bags"
    : "accessories";
}

export function PreviewItemPhoto({
  item,
  sizes,
}: {
  item?: PreviewItem;
  sizes: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
      {item?.imageUrl && failedUrl !== item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes={sizes}
          unoptimized
          className="object-contain"
          onError={() => setFailedUrl(item.imageUrl ?? undefined)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-xs text-secondary">
          <Icon name={item ? "image" : "plus"} className="size-5" />
          {item ? "Image unavailable" : "Empty"}
        </div>
      )}
    </div>
  );
}

export function PreviewStudio({
  items,
  initialSelection = {},
  job,
  profileSummary,
  saving = false,
  readOnly = false,
  initialCategory = "top",
  category: controlledCategory,
  imageOutdated = false,
  onCategoryChange,
  primarySave,
  onSelectionChange,
  onGenerate,
  onSaveLook,
  onEditPreferences,
}: {
  items: PreviewItem[];
  initialSelection?: PreviewSelection;
  job: PreviewJob;
  profileSummary?: {
    swatchLabel?: string;
    undertone?: string;
    bodyReference?: string;
    pose?: string;
  };
  saving?: boolean;
  readOnly?: boolean;
  initialCategory?: PreviewCategory;
  category?: PreviewCategory;
  imageOutdated?: boolean;
  onCategoryChange?: (category: PreviewCategory) => void;
  primarySave?: ReactNode;
  onSelectionChange?: (selection: PreviewSelection) => void;
  onGenerate?: (selection: PreviewSelection) => void;
  onSaveLook?: (selection: PreviewSelection) => void;
  onEditPreferences?: () => void;
}) {
  const [localCategory, setCategory] =
    useState<PreviewCategory>(initialCategory);
  const category = controlledCategory ?? localCategory;
  const tabId = useId();
  const [selection, setSelection] =
    useState<PreviewSelection>(initialSelection);
  const ownedItems = items.filter((item) => item.inventoryStatus === "owned");
  const options = ownedItems.filter((item) => slotForItem(item) === category);
  const chosenItems = CATEGORIES.map(({ key }) =>
    ownedItems.find((item) => item.id === selection[key]),
  ).filter((item): item is PreviewItem => !!item);
  const canGenerate =
    !!onGenerate &&
    !readOnly &&
    job.status !== "unavailable" &&
    chosenItems.length > 0 &&
    job.status !== "queued" &&
    job.status !== "running";
  function pick(itemId?: string) {
    const next = { ...selection, [category]: itemId };
    if (!itemId) delete next[category];
    setSelection(next);
    onSelectionChange?.(next);
  }
  const statusLabel =
    job.status === "succeeded"
      ? imageOutdated
        ? "Previous image"
        : "Ready, illustrative"
      : job.status === "queued"
        ? "Queued"
        : job.status === "running"
          ? "Generating image"
          : job.status === "failed"
            ? "Image could not be made"
            : job.status === "cancelled"
              ? "Image generation stopped"
              : job.status === "unavailable"
                ? "Image provider unavailable"
                : imageOutdated && job.imageUrl
                  ? "Previous image"
                  : "Ready to create";
  return (
    <section className="pb-24 md:pb-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-crimson">Preview</p>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">
            See it on <em className="text-crimson">your avatar.</em>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
            Pick one piece per category. Leave a category empty and it stays
            plain on the avatar.
          </p>
        </div>
        <div className="hidden md:block">
          {primarySave ?? (
            <Button
              variant="primary"
              disabled={
                chosenItems.length === 0 || saving || !onSaveLook || readOnly
              }
              onClick={() => onSaveLook?.(selection)}
            >
              {saving ? "Saving…" : "Save this look"}
            </Button>
          )}
          <p className="mt-2 text-xs text-secondary">
            Saving keeps this exact composition.
          </p>
        </div>
      </header>
      <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_230px]">
        <div className="order-2 min-w-0 rounded-2xl border border-stone bg-paper p-4 md:order-1">
          <div
            role="tablist"
            aria-label="Wardrobe categories"
            className="flex gap-1 overflow-x-auto rounded-xl bg-porcelain p-1"
          >
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${tabId}-${key}`}
                aria-controls={`${tabId}-items`}
                aria-selected={category === key}
                tabIndex={category === key ? 0 : -1}
                onKeyDown={(event) => {
                  const offset =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!offset && event.key !== "Home" && event.key !== "End")
                    return;
                  event.preventDefault();
                  const index =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? CATEGORIES.length - 1
                        : (CATEGORIES.findIndex(
                            (item) => item.key === category,
                          ) +
                            offset +
                            CATEGORIES.length) %
                          CATEGORIES.length;
                  const next = CATEGORIES[index].key;
                  setCategory(next);
                  onCategoryChange?.(next);
                  (
                    event.currentTarget.parentElement?.children[index] as
                      HTMLButtonElement | undefined
                  )?.focus();
                }}
                onClick={() => {
                  setCategory(key);
                  onCategoryChange?.(key);
                }}
                className={
                  "min-h-11 shrink-0 rounded-lg px-3 text-xs " +
                  (category === key ? "bg-paper font-medium" : "")
                }
              >
                {label}
                {selection[key] && <span className="ml-1 text-crimson">•</span>}
              </button>
            ))}
          </div>
          {options.length ? (
            <div
              role="tabpanel"
              id={`${tabId}-items`}
              aria-labelledby={`${tabId}-${category}`}
              className="mt-4 grid grid-cols-3 gap-2"
            >
              {options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => pick(item.id)}
                  disabled={readOnly}
                  aria-pressed={selection[category] === item.id}
                  className={
                    "min-w-0 rounded-xl border p-1 text-left " +
                    (selection[category] === item.id
                      ? "border-2 border-crimson"
                      : "border-stone")
                  }
                >
                  <PreviewItemPhoto
                    item={item}
                    sizes="(max-width: 640px) 30vw, 130px"
                  />
                  <span className="mt-1 block break-words text-xs">
                    {item.name}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => pick()}
                disabled={readOnly}
                aria-pressed={!selection[category]}
                className="min-w-0 rounded-xl border border-dashed border-stone p-1 text-center"
              >
                <PreviewItemPhoto sizes="(max-width: 640px) 30vw, 130px" />
                <span className="mt-1 block text-xs">No {category}</span>
              </button>
            </div>
          ) : (
            <div
              role="tabpanel"
              id={`${tabId}-items`}
              aria-labelledby={`${tabId}-${category}`}
              className="mt-4 rounded-xl bg-porcelain p-5 text-center text-sm text-secondary"
            >
              No owned pieces in this category. You may leave it empty.
              {selection[category] && (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => pick()}
                  className="mt-3 block min-h-11 w-full text-crimson underline"
                >
                  Clear unavailable piece
                </button>
              )}
            </div>
          )}
          <h2 className="mt-5 text-sm font-semibold">Your selection</h2>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {CATEGORIES.map(({ key, label }) => {
              const item = ownedItems.find(
                (candidate) => candidate.id === selection[key],
              );
              return (
                <div key={key} className="min-w-0">
                  <PreviewItemPhoto item={item} sizes="70px" />
                  <p className="mt-1 truncate text-[11px] text-secondary">
                    {label}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-secondary">
            At least one piece is needed. Only one per category.
          </p>
        </div>
        <div className="order-1 min-w-0 rounded-3xl bg-sand p-4 md:order-2">
          <div className="flex items-center justify-between gap-2">
            <span
              role="status"
              className="rounded-full bg-paper px-3 py-1 text-xs"
            >
              <Icon
                name={job.status === "failed" ? "info" : "check"}
                className="mr-1 inline size-3 text-crimson"
              />
              {statusLabel}
            </span>
            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => onGenerate?.(selection)}
              className="min-h-11 text-xs font-medium text-crimson disabled:opacity-50"
            >
              {job.status === "succeeded"
                ? "Generate again"
                : job.status === "failed"
                  ? "Retry image"
                  : "Generate image"}
            </button>
          </div>
          <div className="relative mt-3 aspect-[2/3] overflow-hidden rounded-2xl bg-porcelain">
            {job.imageUrl ? (
              <Image
                src={job.imageUrl}
                alt={
                  imageOutdated
                    ? "Previous illustrative avatar"
                    : "Illustrative avatar wearing the selected outfit"
                }
                loading="eager"
                fill
                sizes="(max-width: 768px) 90vw, 500px"
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
                <Icon name="avatar" className="size-12 text-secondary" />
                <p className="text-sm text-secondary">
                  {job.status === "queued" || job.status === "running"
                    ? "Your illustrative avatar is preparing."
                    : job.status === "failed"
                      ? (job.errorMessage ??
                        "The image failed. Your selection is still here.")
                      : job.status === "unavailable"
                        ? (job.errorMessage ??
                          "Image generation is unavailable right now.")
                        : job.status === "cancelled"
                          ? "Image generation was stopped. Choose Generate image to start again."
                          : "Select pieces to preview a look."}
                </p>
                {(job.status === "queued" || job.status === "running") && (
                  <div className="h-1.5 w-32 animate-pulse rounded-full bg-stone motion-reduce:animate-none" />
                )}
              </div>
            )}
          </div>
          {job.imageUrl && imageOutdated && (
            <p role="status" className="mt-3 text-sm text-secondary">
              {job.status === "queued" || job.status === "running"
                ? "Preparing a new image. The previous image stays visible."
                : job.status === "failed"
                  ? (job.errorMessage ??
                    "The new image failed. Retry image to continue.")
                  : "Previous image. Review your choices and generate an updated preview."}
            </p>
          )}
          <p className="mt-3 rounded-xl bg-paper p-3 text-xs leading-relaxed text-secondary">
            <Icon name="info" className="mr-1 inline size-4" />
            Illustrative avatar. Colors and fit are approximate and do not show
            how the clothes will fit you.
          </p>
        </div>
        <aside className="order-3 space-y-3 md:col-span-2 xl:col-span-1">
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="text-sm font-semibold">Made with your profile</h2>
            {profileSummary && Object.values(profileSummary).some(Boolean) ? (
              <dl className="mt-4 space-y-3 text-xs">
                {profileSummary.swatchLabel && (
                  <div>
                    <dt className="text-secondary">Skin swatch</dt>
                    <dd>{profileSummary.swatchLabel}</dd>
                  </div>
                )}
                {profileSummary.undertone && (
                  <div>
                    <dt className="text-secondary">Undertone</dt>
                    <dd>{profileSummary.undertone}</dd>
                  </div>
                )}
                {profileSummary.bodyReference && (
                  <div>
                    <dt className="text-secondary">Body reference</dt>
                    <dd>{profileSummary.bodyReference}</dd>
                  </div>
                )}
                {profileSummary.pose && (
                  <div>
                    <dt className="text-secondary">Pose</dt>
                    <dd>{profileSummary.pose}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-3 text-xs text-secondary">
                No visual preferences selected. A neutral mannequin will be
                used.
              </p>
            )}
            {onEditPreferences && (
              <div className="mt-4">
                <Button variant="quiet" onClick={onEditPreferences}>
                  Edit preferences
                </Button>
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="text-sm font-semibold">Image status</h2>
            <ol className="mt-3 space-y-2 text-xs">
              {["Queued", "Generating", "Ready"].map((stage, index) => {
                const reached =
                  job.status === "succeeded" ||
                  (index === 0 &&
                    (job.status === "queued" ||
                      job.status === "running" ||
                      job.status === "failed")) ||
                  (index === 1 &&
                    (job.status === "running" || job.status === "failed"));
                return (
                  <li
                    key={stage}
                    className={
                      "flex justify-between " +
                      (reached ? "" : "text-secondary")
                    }
                  >
                    <span>
                      <Icon
                        name={
                          job.status === "failed" && index === 2
                            ? "info"
                            : reached
                              ? "check"
                              : "x"
                        }
                        className="mr-1 inline size-3 text-crimson"
                      />
                      {stage}
                    </span>
                    {index === 2 && job.elapsedSeconds != null
                      ? job.elapsedSeconds + " s"
                      : ""}
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-stone bg-paper p-4 md:hidden">
        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => onGenerate?.(selection)}
          className="min-h-11 text-sm text-crimson disabled:opacity-50"
        >
          {job.status === "succeeded"
            ? "Generate again"
            : job.status === "failed"
              ? "Retry image"
              : "Generate image"}
        </button>
        {primarySave ?? (
          <Button
            variant="primary"
            disabled={!chosenItems.length || saving || !onSaveLook || readOnly}
            onClick={() => onSaveLook?.(selection)}
          >
            {saving ? "Saving…" : "Save this look"}
          </Button>
        )}
      </div>
    </section>
  );
}
