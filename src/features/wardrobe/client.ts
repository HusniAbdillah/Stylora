"use client";
import type { ItemValues, CanonicalWardrobeItem } from "./schema";
import type { publicDraft } from "./server";
import type { WardrobeField } from "./wardrobe-types";
import type { MarketplaceMetadata } from "./catalog";
export type WardrobeDisplayItem = CanonicalWardrobeItem & {
  marketplace?: MarketplaceMetadata | null;
};
export type WardrobeDraft = ReturnType<typeof publicDraft>;
export class WardrobeRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const wardrobeChanged = "stylora:wardrobe-changed";
export async function wardrobeRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/wardrobe${path}`, {
    method,
    cache: "no-store",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new WardrobeRequestError(
      result.error?.code ?? "request_failed",
      result.error?.message ??
        "Your wardrobe could not be loaded or saved. Try again.",
    );
  return result.data as T;
}
export function notifyWardrobeChanged() {
  window.dispatchEvent(new Event(wardrobeChanged));
}
export async function uploadWardrobeFile(
  file: File,
  draft: WardrobeDraft,
  onPrepared?: (draft: WardrobeDraft) => void,
) {
  if (draft.payload.pendingUpload) {
    try {
      return await wardrobeRequest<WardrobeDraft>(
        `/drafts/${draft.id}/verify`,
        "POST",
        {
          assetId: draft.payload.pendingUpload.assetId,
          expectedRevision: draft.revision,
        },
      );
    } catch (error) {
      if (
        !(error instanceof WardrobeRequestError) ||
        error.code !== "storage_download_failed"
      )
        throw error;
    }
  }
  const upload = await wardrobeRequest<{
    assetId: string;
    signedUrl: string;
    draft: WardrobeDraft;
  }>("/uploads", "POST", {
    draftId: draft.id,
    expectedRevision: draft.revision,
    mimeType: file.type,
    byteSize: file.size,
  });
  onPrepared?.(upload.draft);
  const response = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type, "x-upsert": "false" },
    body: file,
  });
  if (!response.ok)
    throw new Error("The photo upload did not finish. Retry the upload.");
  return wardrobeRequest<WardrobeDraft>(`/drafts/${draft.id}/verify`, "POST", {
    assetId: upload.assetId,
    expectedRevision: upload.draft.revision,
  });
}

function label(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (value) => value.toUpperCase());
}
const listKeys = new Set([
  "colors",
  "secondaryColors",
  "accentHex",
  "patternColors",
  "seamDetails",
  "pockets",
  "trim",
  "embellishments",
  "styleTags",
  "suitableOccasions",
  "climateSuitability",
  "carryMode",
]);
export function itemFields(
  item: ItemValues &
    Partial<
      Pick<CanonicalWardrobeItem, "provenance" | "corrections" | "notes">
    >,
): WardrobeField[] {
  const fields = {
    description: item.description,
    ...Object.fromEntries(
      Object.entries(item.attributes).map(([key, value]) => [
        `attributes.${key}`,
        value,
      ]),
    ),
    ...(item.notes !== undefined ? { notes: item.notes } : {}),
  };
  return Object.entries(fields).map(([key, value]) => ({
    key,
    label:
      label(key.replace("attributes.", "")) +
      (Array.isArray(value) ? " (comma separated)" : ""),
    value: Array.isArray(value) ? value.join(", ") : String(value ?? ""),
    source: item.corrections?.[key] ? "user" : item.provenance?.[key]?.source,
    editable: true,
  }));
}
export function changeField(
  values: ItemValues,
  key: string,
  text: string,
): ItemValues {
  if (key === "description") return { ...values, description: text };
  if (key === "subcategory") return { ...values, subcategory: text || null };
  const attribute = key.replace(/^attributes\./, "");
  return {
    ...values,
    attributes: {
      ...values.attributes,
      [attribute]: listKeys.has(attribute)
        ? text
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : text || null,
    },
  };
}
export function displayWardrobeItem(item: WardrobeDisplayItem) {
  return {
    ...item,
    fields: itemFields(item),
    isSample: item.sourceType === "sample",
  };
}
export function draftPointer(key: string, value?: string | null) {
  if (value === undefined) return window.localStorage.getItem(key);
  if (value === null) window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  return value;
}

export function intakeFields(
  values: ItemValues,
  provenance?: CanonicalWardrobeItem["provenance"],
  original?: ItemValues | null,
): WardrobeField[] {
  const fields = itemFields({ ...values, provenance });
  const groups = [
    ["Colors", [["colors", "Colors (comma separated)"]]],
    ["Pattern", [["pattern", "Pattern"]]],
    [
      "Fabric look",
      [
        ["apparentMaterial", "Apparent material"],
        ["texture", "Texture"],
      ],
    ],
    [
      "Silhouette and fit",
      [
        ["silhouette", "Silhouette"],
        ["fit", "Fit"],
      ],
    ],
    ["Length", [["length", "Length"]]],
    [
      "Neckline and sleeve",
      [
        ["neckline", "Neckline"],
        ["sleeve", "Sleeve"],
      ],
    ],
    ["Occasion", [["occasion", "Occasion"]]],
  ] as const;
  const originalFields = original ? itemFields(original) : [];
  return groups.flatMap(([group, entries]) =>
    entries.map(([key, label]) => {
      const field = fields.find(
        (candidate) => candidate.key === `attributes.${key}`,
      );
      const before = originalFields.find(
        (candidate) => candidate.key === `attributes.${key}`,
      );
      return {
        ...field,
        key: `attributes.${key}`,
        label,
        group,
        value: field?.value ?? "",
        editable: true,
        source:
          field?.value.trim() && (!original || field.value !== before?.value)
            ? ("user" as const)
            : field?.source,
      };
    }),
  );
}
