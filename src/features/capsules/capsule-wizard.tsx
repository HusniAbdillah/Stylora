"use client";

import Image from "next/image";
import { useState } from "react";
import { Button, Chip, ConfirmDialog, Icon, Stepper } from "@/components/ui";
import {
  CAPSULE_TEMPLATES,
  EMPTY_CAPSULE_DRAFT,
  type CapsuleDraft,
  type CapsuleItem,
  type CapsuleTemplate,
  type CapsuleTemplateId,
} from "./capsule-types";

const STEPS = [
  "Template",
  "Purpose and context",
  "Style and practicality",
  "Items",
] as const;
const ACTIVITIES = [
  ["City walks", "image"],
  ["Dinner out", "star"],
  ["Museums", "layers"],
  ["Beach", "sun"],
  ["Meetings", "bag"],
  ["Wedding", "sparkle"],
] as const;
const WEATHERS = ["Hot and humid", "Mild", "Cool evenings", "Rain likely"];
const PALETTES = [
  {
    name: "Warm neutrals",
    swatches: ["bg-porcelain", "bg-camel", "bg-secondary", "bg-crimson"],
  },
  { name: "Cool classics", swatches: ["bg-night", "bg-secondary", "bg-stone"] },
  { name: "Soft color", swatches: ["bg-rose-wash", "bg-blush", "bg-sage"] },
  {
    name: "Use my wardrobe colors",
    swatches: ["bg-stone", "bg-night", "bg-porcelain"],
  },
];

export function CapsuleTemplateCard({
  template,
  selected = false,
  onSelect,
}: {
  template: CapsuleTemplate;
  selected?: boolean;
  onSelect?: (id: CapsuleTemplateId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(template.id)}
      aria-pressed={selected}
      className={
        "grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-3 rounded-2xl border bg-paper p-2 text-left hover:border-crimson focus-visible:outline-2 focus-visible:outline-crimson sm:block " +
        (selected
          ? "order-first border-crimson bg-blush sm:order-none"
          : "border-stone")
      }
    >
      <span className="relative block h-[100px] overflow-hidden rounded-xl bg-sand sm:aspect-[4/5] sm:h-auto">
        <Image
          src={template.imageUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 96px, 190px"
          className="object-cover"
        />
      </span>
      <span>
        <span className="mt-2 block font-serif text-xl leading-tight lg:text-2xl">
          {template.name}
        </span>
        <span className="mt-1 block text-xs text-secondary">
          {template.tagline}
        </span>
        <span className="mt-2 hidden space-y-1 text-xs lg:block">
          {template.cues.map((cue) => (
            <span key={cue} className="block">
              <Icon name="check" className="mr-1 inline size-3 text-crimson" />
              {cue}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

function TemplateReplaceDialog({
  open,
  onKeep,
  onReplace,
}: {
  open: boolean;
  onKeep: () => void;
  onReplace: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onKeep}
      onConfirm={onReplace}
      title="Replace your choices?"
      description="The new template will replace your edited brief defaults. Your owned wardrobe items will stay available."
      cancelLabel="Keep choices"
      confirmLabel="Use new template"
    />
  );
}

function StepHeading({
  step,
  templateName,
}: {
  step: number;
  templateName?: string;
}) {
  const titles = [
    <>
      Start from a <em className="text-crimson">template.</em>
    </>,
    <>
      Where is this <em className="text-crimson">capsule going?</em>
    </>,
    <>
      How should it <em className="text-crimson">look and feel?</em>
    </>,
    <>
      Pick the <em className="text-crimson">pieces.</em>
    </>,
  ];
  const descriptions = [
    "A capsule is a small set of pieces that makes several complete outfits. Templates fill every field with editable defaults; your wardrobe and preferences stay in charge.",
    "Choose what matters for this capsule. You only need to type for special details.",
    "Your saved preferences can guide this capsule. Change anything just for this plan.",
    "Choose owned items to include. Pin a piece to make sure it is used, or exclude it.",
  ];
  return (
    <div>
      <p className="text-xs font-medium text-crimson">
        {templateName ?? "New capsule"}
      </p>
      <h1 className="mt-2 max-w-2xl font-serif text-4xl leading-tight md:text-5xl">
        {titles[step]}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-secondary">
        {descriptions[step]}
      </p>
    </div>
  );
}

export function CapsuleWizard({
  initialDraft = EMPTY_CAPSULE_DRAFT,
  initialStep = 0,
  initialVisited = initialStep,
  ownedItems,
  profileSummary,
  busy = false,
  onDraftChange,
  onStepChange,
  onBuild,
  onBackToCollection,
}: {
  initialDraft?: CapsuleDraft;
  initialStep?: 0 | 1 | 2 | 3;
  initialVisited?: number;
  ownedItems: CapsuleItem[];
  profileSummary?: string[];
  busy?: boolean;
  onDraftChange?: (draft: CapsuleDraft) => void;
  onStepChange?: (step: 0 | 1 | 2 | 3, visited: number) => void;
  onBuild?: (draft: CapsuleDraft) => void;
  onBackToCollection?: () => void;
}) {
  const [draft, setDraft] = useState<CapsuleDraft>(initialDraft);
  const [step, setStep] = useState<number>(initialStep);
  const [visited, setVisited] = useState<number>(initialVisited);
  const [touched, setTouched] = useState(() =>
    Object.keys(EMPTY_CAPSULE_DRAFT).some((key) => {
      const field = key as keyof CapsuleDraft;
      return (
        JSON.stringify(initialDraft[field]) !==
        JSON.stringify(EMPTY_CAPSULE_DRAFT[field])
      );
    }),
  );
  const [pendingTemplate, setPendingTemplate] = useState<
    CapsuleTemplateId | null | undefined
  >(undefined);
  const [activeCategory, setActiveCategory] =
    useState<CapsuleItem["category"]>("top");
  const template = CAPSULE_TEMPLATES.find(
    (item) => item.id === draft.templateId,
  );
  const inventory = ownedItems.filter(
    (item) => item.inventoryStatus === "owned",
  );
  const categories: CapsuleItem["category"][] = [
    "top",
    "bottom",
    "dress",
    "outerwear",
    "shoes",
    "accessory",
  ];
  const visibleItems = inventory.filter(
    (item) => item.category === activeCategory,
  );

  function change(next: CapsuleDraft) {
    setDraft(next);
    setTouched(true);
    onDraftChange?.(next);
  }
  function applyTemplate(id: CapsuleTemplateId | null) {
    const selected = CAPSULE_TEMPLATES.find((item) => item.id === id);
    const next = {
      ...EMPTY_CAPSULE_DRAFT,
      ...(selected?.defaults ?? {}),
      templateId: id,
      includedItemIds: draft.includedItemIds,
      requiredItemIds: draft.requiredItemIds,
      excludedItemIds: draft.excludedItemIds,
    };
    change(next);
    setPendingTemplate(undefined);
  }
  function selectTemplate(id: CapsuleTemplateId | null) {
    if (touched && draft.templateId !== id) setPendingTemplate(id);
    else applyTemplate(id);
  }
  function toggleList(
    key:
      "activities" | "includedItemIds" | "requiredItemIds" | "excludedItemIds",
    value: string,
  ) {
    const current = draft[key] as string[];
    change({
      ...draft,
      [key]: current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    });
  }
  function chooseItem(itemId: string) {
    const included = draft.includedItemIds.includes(itemId);
    change({
      ...draft,
      includedItemIds: included
        ? draft.includedItemIds.filter((id) => id !== itemId)
        : [...draft.includedItemIds, itemId],
      requiredItemIds: included
        ? draft.requiredItemIds.filter((id) => id !== itemId)
        : draft.requiredItemIds,
      excludedItemIds: draft.excludedItemIds.filter((id) => id !== itemId),
    });
  }
  function nextStep() {
    if (step === 3) {
      onBuild?.(draft);
      return;
    }
    const next = Math.min(step + 1, 3);
    setStep(next);
    setVisited(Math.max(visited, next));
    onStepChange?.(next as 0 | 1 | 2 | 3, Math.max(visited, next));
  }
  function goToStep(next: number) {
    setStep(next);
    onStepChange?.(next as 0 | 1 | 2 | 3, visited);
  }
  const canContinue =
    step === 0 || step === 1
      ? step === 0 || (draft.activities.length > 0 && !!draft.weather)
      : step === 2
        ? !!draft.palette && !!draft.dressCode
        : draft.includedItemIds.length > 0;
  const nextLabel = step === 3 ? "Build capsule" : "Continue";

  return (
    <div className="pb-20 md:pb-4">
      <div className="mb-5">
        <Stepper
          steps={STEPS}
          current={step}
          visited={Array.from({ length: visited + 1 }, (_, index) => index)}
          onSelect={goToStep}
          label="Capsule progress"
        />
      </div>
      <header className="flex flex-wrap items-end justify-between gap-5">
        <StepHeading step={step} templateName={template?.name} />
        <div className="hidden md:block">
          <Button
            variant="primary"
            disabled={!canContinue || busy}
            onClick={nextStep}
          >
            {busy ? "Preparing…" : nextLabel}
          </Button>
        </div>
      </header>

      {step === 0 && (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {CAPSULE_TEMPLATES.map((item) => (
              <CapsuleTemplateCard
                key={item.id}
                template={item}
                selected={draft.templateId === item.id}
                onSelect={selectTemplate}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone bg-paper p-3 text-sm text-secondary">
            <span>Prefer to start blank? You can fill each step yourself.</span>
            <Button variant="secondary" onClick={() => selectTemplate(null)}>
              Start blank
            </Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">How long?</h2>
            <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-porcelain p-1">
              {[2, 3, 5, 7].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => change({ ...draft, days })}
                  className={
                    "min-h-11 rounded-lg text-sm " +
                    (draft.days === days
                      ? "border border-crimson bg-paper"
                      : "")
                  }
                >
                  {days} days
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">How many outfits?</h2>
            <div className="mt-4 flex items-center gap-4">
              <button
                type="button"
                aria-label="One fewer outfit"
                disabled={draft.targetOutfits <= 3}
                onClick={() =>
                  change({ ...draft, targetOutfits: draft.targetOutfits - 1 })
                }
                className="flex size-11 items-center justify-center rounded-full bg-porcelain"
              >
                −
              </button>
              <span className="font-serif text-3xl text-crimson">
                {draft.targetOutfits}
              </span>
              <button
                type="button"
                aria-label="One more outfit"
                disabled={draft.targetOutfits >= 6}
                onClick={() =>
                  change({ ...draft, targetOutfits: draft.targetOutfits + 1 })
                }
                className="flex size-11 items-center justify-center rounded-full bg-porcelain"
              >
                +
              </button>
              <span className="text-xs text-secondary">Between 3 and 6</span>
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4 md:col-span-2">
            <h2 className="font-serif text-2xl">What will you do there?</h2>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ACTIVITIES.map(([name, icon]) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={draft.activities.includes(name)}
                  onClick={() => toggleList("activities", name)}
                  className={
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-xs " +
                    (draft.activities.includes(name)
                      ? "border-crimson bg-blush"
                      : "border-stone")
                  }
                >
                  <Icon name={icon} className="size-5 text-crimson" />
                  {name}
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4 md:col-span-2">
            <h2 className="font-serif text-2xl">What weather?</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {WEATHERS.map((value) => (
                <Chip
                  key={value}
                  selected={draft.weather === value}
                  onClick={() => change({ ...draft, weather: value })}
                >
                  {value}
                </Chip>
              ))}
            </div>
            {!draft.weather && (
              <p className="mt-2 text-xs text-secondary">
                Choose one to prepare outfits.
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">Laundry on the trip?</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {["No laundry", "Can wash once"].map((value) => (
                <Chip
                  key={value}
                  selected={draft.laundry === value}
                  onClick={() => change({ ...draft, laundry: value })}
                >
                  {value}
                </Chip>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <label htmlFor="capsule-notes" className="font-serif text-2xl">
              Anything specific?
            </label>
            <textarea
              id="capsule-notes"
              value={draft.notes}
              onChange={(event) =>
                change({ ...draft, notes: event.target.value })
              }
              placeholder="Optional details for this capsule"
              className="mt-4 min-h-24 w-full rounded-xl border border-stone bg-porcelain p-3 text-sm"
            />
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-stone bg-paper p-4 md:col-span-2">
            <h2 className="font-serif text-2xl">Palette</h2>
            <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-4">
              {PALETTES.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => change({ ...draft, palette: item.name })}
                  aria-pressed={draft.palette === item.name}
                  className={
                    "rounded-xl border p-2 text-left text-xs " +
                    (draft.palette === item.name
                      ? "border-crimson bg-blush"
                      : "border-stone")
                  }
                >
                  <span className="mb-2 flex h-8 overflow-hidden rounded-lg">
                    {item.swatches.map((swatch, index) => (
                      <span key={index} className={"flex-1 " + swatch} />
                    ))}
                  </span>
                  {item.name}
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">Dress code</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Casual", "Smart casual", "Business casual", "Evening"].map(
                (value) => (
                  <Chip
                    key={value}
                    selected={draft.dressCode === value}
                    onClick={() => change({ ...draft, dressCode: value })}
                  >
                    {value}
                  </Chip>
                ),
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">Luggage size</h2>
            <div className="mt-4 flex gap-2">
              {["Carry-on", "Checked bag"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => change({ ...draft, luggage: value })}
                  aria-pressed={draft.luggage === value}
                  className={
                    "flex min-h-20 flex-1 flex-col items-center justify-center gap-1 rounded-xl border text-sm " +
                    (draft.luggage === value
                      ? "border-crimson bg-blush"
                      : "border-stone")
                  }
                >
                  <Icon name="bag" className="size-5 text-crimson" />
                  {value}
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">Comfort</h2>
            {(
              [
                ["Footwear", "footwear", ["Walkable flats", "Low heel"]],
                [
                  "Coverage",
                  "coverage",
                  ["No preference", "Shoulders covered"],
                ],
                ["Care", "care", ["Easy care", "Any"]],
              ] as const
            ).map(([label, key, values]) => (
              <div key={key} className="mt-4 flex flex-wrap items-center gap-2">
                <span className="w-20 text-xs font-medium">{label}</span>
                {values.map((value) => (
                  <Chip
                    key={value}
                    selected={draft[key] === value}
                    onClick={() => change({ ...draft, [key]: value })}
                  >
                    {value}
                  </Chip>
                ))}
              </div>
            ))}
          </section>
          <section className="rounded-2xl border border-rose-wash bg-blush p-4">
            <h2 className="font-serif text-2xl">From your profile</h2>
            {profileSummary?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {profileSummary.map((line) => (
                  <li key={line}>
                    <Icon
                      name="check"
                      className="mr-2 inline size-4 text-crimson"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-secondary">
                No preferences selected. This capsule can still use your
                wardrobe and brief.
              </p>
            )}
          </section>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <section className="min-w-0 rounded-2xl border border-stone bg-paper p-4">
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-porcelain p-1">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={
                    "min-h-10 shrink-0 rounded-lg px-3 text-xs capitalize " +
                    (activeCategory === category ? "bg-paper font-medium" : "")
                  }
                >
                  {category === "top"
                    ? "Tops"
                    : category === "bottom"
                      ? "Bottoms"
                      : category === "dress"
                        ? "Dresses"
                        : category === "outerwear"
                          ? "Outerwear"
                          : category === "shoes"
                            ? "Shoes"
                            : "Accessories"}{" "}
                  {
                    inventory.filter((item) => item.category === category)
                      .length
                  }
                </button>
              ))}
            </div>
            {visibleItems.length ? (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                {visibleItems.map((item) => {
                  const included = draft.includedItemIds.includes(item.id);
                  const required = draft.requiredItemIds.includes(item.id);
                  const excluded = draft.excludedItemIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      className={
                        "min-w-0 rounded-xl border p-1 " +
                        (included
                          ? "border-crimson"
                          : excluded
                            ? "border-rose-wash opacity-70"
                            : "border-stone")
                      }
                    >
                      <button
                        type="button"
                        onClick={() => chooseItem(item.id)}
                        aria-pressed={included}
                        className="w-full text-left"
                      >
                        <span className="relative block aspect-square overflow-hidden rounded-lg bg-sand">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              fill
                              sizes="(max-width: 640px) 30vw, 150px"
                              unoptimized
                              className="object-contain"
                            />
                          ) : (
                            <span className="flex size-full items-center justify-center text-secondary">
                              <Icon name="image" className="size-5" />
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-xs">
                          {item.name}
                        </span>
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            change({
                              ...draft,
                              includedItemIds: included
                                ? draft.includedItemIds
                                : [...draft.includedItemIds, item.id],
                              requiredItemIds: required
                                ? draft.requiredItemIds.filter(
                                    (id) => id !== item.id,
                                  )
                                : [...draft.requiredItemIds, item.id],
                              excludedItemIds: draft.excludedItemIds.filter(
                                (id) => id !== item.id,
                              ),
                            })
                          }
                          className={
                            "rounded px-1 text-[10px] " +
                            (required
                              ? "bg-blush text-crimson"
                              : "text-secondary")
                          }
                        >
                          {required ? "Must use" : "Pin"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            change({
                              ...draft,
                              excludedItemIds: excluded
                                ? draft.excludedItemIds.filter(
                                    (id) => id !== item.id,
                                  )
                                : [...draft.excludedItemIds, item.id],
                              includedItemIds: draft.includedItemIds.filter(
                                (id) => id !== item.id,
                              ),
                              requiredItemIds: draft.requiredItemIds.filter(
                                (id) => id !== item.id,
                              ),
                            })
                          }
                          className={
                            "rounded px-1 text-[10px] " +
                            (excluded
                              ? "bg-blush text-crimson"
                              : "text-secondary")
                          }
                        >
                          {excluded ? "Excluded" : "Exclude"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-6 text-sm text-secondary">
                No owned items in this category. Saved candidates are excluded
                from capsule generation.
              </p>
            )}
            <p className="mt-4 text-xs text-secondary">
              Saved candidates are hidden because capsules use owned pieces
              only.
            </p>
          </section>
          <aside className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">In this capsule</h2>
            <p className="mt-2 text-xs text-secondary">
              {draft.includedItemIds.length} pieces,{" "}
              {draft.requiredItemIds.length} must use,{" "}
              {draft.excludedItemIds.length} excluded
            </p>
            <div className="mt-3 grid grid-cols-4 gap-1">
              {inventory
                .filter((item) => draft.includedItemIds.includes(item.id))
                .slice(0, 8)
                .map((item) => (
                  <span
                    key={item.id}
                    className="relative aspect-square overflow-hidden rounded-lg bg-sand"
                  >
                    {item.imageUrl && (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
                        sizes="64px"
                        unoptimized
                        className="object-contain"
                      />
                    )}
                  </span>
                ))}
            </div>
          </aside>
        </div>
      )}

      <footer className="mt-6 hidden items-center justify-between md:flex">
        <Button
          variant="quiet"
          onClick={() => (step ? goToStep(step - 1) : onBackToCollection?.())}
        >
          ←{" "}
          {step
            ? "Back to " + STEPS[step - 1].toLowerCase()
            : "Back to capsules"}
        </Button>
        <Button
          variant="primary"
          disabled={!canContinue || busy}
          onClick={nextStep}
        >
          {busy ? "Preparing…" : nextLabel}
        </Button>
      </footer>
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t border-stone bg-paper p-4 md:hidden">
        <Button
          variant="quiet"
          onClick={() => (step ? goToStep(step - 1) : onBackToCollection?.())}
        >
          Back
        </Button>
        <Button
          variant="primary"
          disabled={!canContinue || busy}
          onClick={nextStep}
        >
          {busy ? "Preparing…" : nextLabel}
        </Button>
      </div>
      <TemplateReplaceDialog
        open={pendingTemplate !== undefined}
        onKeep={() => setPendingTemplate(undefined)}
        onReplace={() => applyTemplate(pendingTemplate ?? null)}
      />
    </div>
  );
}
