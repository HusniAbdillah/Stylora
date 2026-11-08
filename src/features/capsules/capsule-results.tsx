"use client";

import Image from "next/image";
import { useState } from "react";
import { Badge, Button, ConfirmDialog, Icon } from "@/components/ui";
import {
  CAPSULE_TEMPLATES,
  type CapsuleItem,
  type CapsuleOutfit,
  type CapsuleResult,
} from "./capsule-types";

function PieceImage({
  item,
  sizes = "120px",
}: {
  item: Pick<CapsuleItem, "name" | "imageUrl">;
  sizes?: string;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
      {item.imageUrl ? (
        <Image
          src={item.imageUrl}
          alt={item.name}
          fill
          sizes={sizes}
          unoptimized
          className="object-contain"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-secondary">
          <Icon name="image" className="size-5" />
        </span>
      )}
    </div>
  );
}

function OutfitCard({
  outfit,
  onPreview,
  onSaveAsLook,
  onOpen,
}: {
  outfit: CapsuleOutfit;
  onPreview?: (id: string) => void;
  onSaveAsLook?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-stone bg-paper p-4">
      <button
        type="button"
        onClick={() => onOpen?.(outfit.id)}
        className="w-full text-left"
      >
        <div className="grid grid-cols-4 gap-2">
          {outfit.items.slice(0, 4).map((item) => (
            <PieceImage
              key={item.id}
              item={item}
              sizes="(max-width: 640px) 20vw, 110px"
            />
          ))}
        </div>
        {outfit.proposedItems?.map((item) => (
          <div
            key={item.name}
            className="mt-2 flex items-center gap-2 rounded-xl bg-missing-bg p-3 text-xs text-missing"
          >
            <Icon name="bag" size={16} />
            <span>Proposed addition. {item.name}</span>
          </div>
        ))}
        <div className="mt-3 flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl">{outfit.title}</h3>
          {outfit.occasion && (
            <span className="rounded-full border border-crimson px-2 py-1 text-xs text-crimson">
              {outfit.occasion}
            </span>
          )}
        </div>
      </button>
      <ul className="mt-3 space-y-2 text-xs leading-relaxed">
        {outfit.reasons.slice(0, 2).map((reason, index) => (
          <li key={index} className="flex gap-2">
            <Icon
              name="check"
              className="mt-0.5 size-3 shrink-0 text-crimson"
            />
            {reason}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        {onPreview && (
          <Button variant="quiet" onClick={() => onPreview(outfit.id)}>
            Preview
          </Button>
        )}
        {onSaveAsLook && (
          <Button variant="secondary" onClick={() => onSaveAsLook(outfit.id)}>
            Save as look
          </Button>
        )}
      </div>
    </article>
  );
}

export function CapsuleCollection({
  capsules,
  onNew,
  onOpen,
  onContinueDraft,
  onDelete,
}: {
  capsules: CapsuleResult[];
  onNew?: () => void;
  onOpen?: (id: string) => void;
  onContinueDraft?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<CapsuleResult | null>(
    null,
  );
  return (
    <section>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl">Capsules</h1>
          <p className="mt-2 max-w-xl text-sm text-secondary">
            Plan outfits from owned pieces for work, travel or everyday wear.
          </p>
        </div>
        <Button variant="primary" onClick={onNew}>
          New capsule
        </Button>
      </header>
      {capsules.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capsules.map((capsule) => {
            const template = CAPSULE_TEMPLATES.find(
              (item) => item.id === capsule.templateId,
            );
            return (
              <article
                key={capsule.id}
                className="rounded-2xl border border-stone bg-paper p-3"
              >
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sand">
                  {template && (
                    <Image
                      src={template.imageUrl}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 90vw, 350px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <h2 className="font-serif text-xl">{capsule.title}</h2>
                  {capsule.isDraft && <Badge tone="neutral">Draft</Badge>}
                </div>
                <p className="mt-1 text-xs text-secondary">
                  {capsule.isDraft
                    ? "Draft ready to continue"
                    : (capsule.pieceCount ?? capsule.pieces.length) +
                      " pieces, " +
                      (capsule.outfitCount ?? capsule.outfits.length) +
                      " outfits"}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  {onDelete ? (
                    <Button
                      variant="quiet"
                      aria-label={"Delete " + capsule.title}
                      onClick={() => setPendingDelete(capsule)}
                    >
                      <Icon name="trash" className="size-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button
                    variant="secondary"
                    onClick={() =>
                      capsule.isDraft
                        ? onContinueDraft?.(capsule.id)
                        : onOpen?.(capsule.id)
                    }
                  >
                    {capsule.isDraft ? "Continue draft" : "Open"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-stone bg-paper p-8 text-center">
          <Icon name="layers" className="mx-auto size-8 text-crimson" />
          <h2 className="mt-3 font-serif text-2xl">No capsules yet</h2>
          <p className="mt-2 text-sm text-secondary">
            Choose a template and select the pieces to include.
          </p>
        </div>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete?.(pendingDelete.id);
          setPendingDelete(null);
        }}
        title={"Delete “" + (pendingDelete?.title ?? "this capsule") + "”?"}
        description="This removes the capsule and its outfit plans. Saved looks remain unchanged."
        confirmLabel="Delete capsule"
      />
    </section>
  );
}

export function CapsuleResults({
  result,
  onEditBrief,
  onSaveCapsule,
  onPreview,
  onSaveAsLook,
  onOpenOutfit,
  onFindAddition,
}: {
  result: CapsuleResult;
  onEditBrief?: () => void;
  onSaveCapsule?: (id: string) => void;
  onPreview?: (id: string) => void;
  onSaveAsLook?: (id: string) => void;
  onOpenOutfit?: (id: string) => void;
  onFindAddition?: (additionId: string) => void;
}) {
  const owned = result.outfits.filter((outfit) => !outfit.requiresAddition);
  const withAddition = result.outfits.filter(
    (outfit) => outfit.requiresAddition,
  );
  return (
    <section className="space-y-6 pb-20 md:pb-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-crimson">
            {result.subtitle ?? result.title}
          </p>
          <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">
            {result.outfits.length}{" "}
            {result.outfits.length === 1 ? "outfit" : "outfits"} from{" "}
            <em className="text-crimson">
              {result.pieces.length}{" "}
              {result.pieces.length === 1 ? "piece." : "pieces."}
            </em>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-secondary">
            Built from your wardrobe text and IDs. Suggestions that need another
            piece are shown separately.
          </p>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {onEditBrief && (
            <Button variant="quiet" onClick={onEditBrief}>
              Edit brief
            </Button>
          )}
          <Button variant="primary" onClick={() => onSaveCapsule?.(result.id)}>
            Save capsule
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          [result.pieces.length, "Owned pieces used"],
          [result.additions.length, "Suggested additions"],
          [result.outfits.length, "Complete outfits"],
        ].map(([number, label]) => (
          <div
            key={label}
            className="rounded-xl border border-stone bg-paper p-3"
          >
            <p className="font-serif text-3xl text-crimson">{number}</p>
            <p className="text-xs">{label}</p>
          </div>
        ))}
      </div>
      <section className="hidden rounded-2xl border border-stone bg-paper p-5 md:block">
        <h2 className="font-serif text-2xl">The pieces</h2>
        <div className="mt-3 grid grid-cols-6 gap-2 lg:grid-cols-9">
          {result.pieces.map((item) => (
            <div key={item.id} className="min-w-0">
              <PieceImage item={item} sizes="100px" />
              <p className="mt-1 line-clamp-2 text-xs">{item.name}</p>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2 className="font-serif text-2xl">Only what you own</h2>
        {owned.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {owned.map((outfit) => (
              <OutfitCard
                key={outfit.id}
                outfit={outfit}
                onPreview={onPreview}
                onSaveAsLook={onSaveAsLook}
                onOpen={onOpenOutfit}
              />
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-stone bg-paper p-6 text-sm text-secondary">
            No complete owned-only outfits are available from these pieces.
            Review the brief or add owned items.
          </div>
        )}
      </section>
      {withAddition.length > 0 && (
        <section>
          <h2 className="font-serif text-2xl">With one addition</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="grid gap-4 md:grid-cols-2">
              {withAddition.map((outfit) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  onPreview={onPreview}
                  onSaveAsLook={onSaveAsLook}
                  onOpen={onOpenOutfit}
                />
              ))}
            </div>
            <div className="space-y-3">
              {result.additions.map((addition) => (
                <article
                  key={addition.id}
                  className="rounded-2xl border border-rose-wash bg-blush p-4"
                >
                  <h3 className="font-serif text-xl text-crimson">
                    Why add {addition.name.toLowerCase()}?
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed">
                    {addition.brief}
                  </p>
                  <p className="mt-2 text-xs text-secondary">
                    Unlocks {addition.unlockedOutfitIds.length} supported
                    outfits with pieces you own.
                  </p>
                  <ul className="mt-3 space-y-1 text-xs">
                    {addition.supportingItemNames.map((name) => (
                      <li key={name} className="rounded-lg bg-paper p-2">
                        <Icon
                          name="layers"
                          className="mr-1 inline size-3 text-crimson"
                        />
                        {name}
                      </li>
                    ))}
                  </ul>
                  {onFindAddition && (
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        onClick={() => onFindAddition(addition.id)}
                      >
                        Find {addition.name.toLowerCase()}
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-between border-t border-stone bg-paper p-4 md:hidden">
        {onEditBrief && (
          <Button variant="quiet" onClick={onEditBrief}>
            Edit brief
          </Button>
        )}
        <Button variant="primary" onClick={() => onSaveCapsule?.(result.id)}>
          Save capsule
        </Button>
      </div>
    </section>
  );
}

export function CapsuleOutfitDetail({
  outfit,
  index,
  total,
  avatarUrl,
  onDelete,
  onSaveAsLook,
  onBack,
}: {
  outfit: CapsuleOutfit;
  index: number;
  total: number;
  avatarUrl?: string | null;
  onDelete?: (id: string) => void;
  onSaveAsLook?: (id: string) => void;
  onBack?: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <article className="pb-20 md:pb-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-crimson">
            Outfit {index} of {total}
          </p>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">
            {outfit.title}
          </h1>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          {onDelete && (
            <Button variant="quiet" onClick={() => setDeleteOpen(true)}>
              Delete
            </Button>
          )}
          <Button variant="primary" onClick={() => onSaveAsLook?.(outfit.id)}>
            Save as look
          </Button>
        </div>
      </header>
      <div className="mt-6 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-stone bg-paper p-3">
          {outfit.items.map((item) => (
            <div key={item.id}>
              <PieceImage item={item} sizes="(max-width: 640px) 44vw, 280px" />
              <p className="mt-1 text-sm font-medium">{item.name}</p>
              <p className="text-xs capitalize text-secondary">
                {item.category}, owned
              </p>
            </div>
          ))}
          {outfit.proposedItems?.map((item) => (
            <div
              key={item.name}
              className="rounded-xl bg-missing-bg p-4 text-missing"
            >
              <Icon name="bag" />
              <h2 className="mt-2 font-medium">{item.name}</h2>
              <p className="mt-2 text-xs">
                Proposed addition. {item.description}
              </p>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <section className="rounded-2xl border border-stone bg-paper p-4">
            <h2 className="font-serif text-2xl">Why this works</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {outfit.reasons.map((reason, i) => (
                <li key={i} className="flex gap-2">
                  <Icon
                    name="check"
                    className="mt-0.5 size-4 shrink-0 text-crimson"
                  />
                  <span>
                    {reason}
                    {outfit.evidence?.[i] && (
                      <small className="mt-1 block text-secondary">
                        {outfit.evidence[i].evidenceItemIds
                          .map(
                            (id) =>
                              outfit.items.find((item) => item.id === id)?.name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </small>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {outfit.inputsUsed?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {outfit.inputsUsed.map((input) => (
                  <span
                    key={input}
                    className="rounded-full border border-crimson bg-blush px-2 py-1 text-xs"
                  >
                    {input}
                  </span>
                ))}
              </div>
            ) : null}
            {outfit.differences?.length ? (
              <div className="mt-4">
                <h3 className="text-sm font-medium">Differences</h3>
                <ul className="mt-2 space-y-1 text-xs text-secondary">
                  {outfit.differences.map((difference) => (
                    <li key={difference}>{difference}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {outfit.uncertainty?.length ? (
              <div className="mt-4">
                <h3 className="text-sm font-medium">Uncertainty</h3>
                <ul className="mt-2 space-y-1 text-xs text-secondary">
                  {outfit.uncertainty.map((uncertainty) => (
                    <li key={uncertainty}>{uncertainty}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
          {avatarUrl && (
            <div className="flex items-center gap-3 rounded-2xl border border-rose-wash bg-blush p-3">
              <div className="relative size-20 overflow-hidden rounded-xl">
                <Image
                  src={avatarUrl}
                  alt="Illustrative avatar"
                  fill
                  sizes="80px"
                  unoptimized
                  className="object-cover"
                />
              </div>
              <p className="text-sm">
                Avatar ready. Saving as a look can reuse this image.
              </p>
            </div>
          )}
        </div>
      </div>
      {onBack && (
        <div className="mt-5 hidden md:block">
          <Button variant="quiet" onClick={onBack}>
            ← Back to capsule
          </Button>
        </div>
      )}
      {onDelete && (
        <div className="mt-4 md:hidden">
          <Button variant="quiet" onClick={() => setDeleteOpen(true)}>
            Delete outfit
          </Button>
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-stone bg-paper p-4 md:hidden">
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={() => onSaveAsLook?.(outfit.id)}>
          Save as look
        </Button>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          onDelete?.(outfit.id);
        }}
        title={"Delete “" + outfit.title + "”?"}
        description="This removes the outfit from this capsule. Saved looks remain unchanged."
        confirmLabel="Delete outfit"
      />
    </article>
  );
}
