"use client";
import { withFeedback } from "@/lib/feedback/store";
import type { ItemValues, CanonicalWardrobeItem } from "./schema";
import type { publicDraft } from "./server";
import type { WardrobeField } from "./wardrobe-types";
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
  const run = async () => {
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
  };
  if (
    method === "GET" ||
    path === "/uploads" ||
    path.endsWith("/verify") ||
    path.endsWith("/analyze")
  )
    return run();
  return withFeedback(
    {
      id: `wardrobe:${method}:${path}`,
      label: "Wardrobe update",
      success: path.endsWith("/confirm")
        ? "Piece added to your wardrobe."
        : "Wardrobe change saved.",
      href: "/wardrobe",
      quiet: path.includes("/drafts") && !path.endsWith("/confirm"),
    },
    run,
  );
}
export function notifyWardrobeChanged() {
  window.dispatchEvent(new Event(wardrobeChanged));
}
async function uploadWardrobeFileData(
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
export function uploadWardrobeFile(
  file: File,
  draft: WardrobeDraft,
  onPrepared?: (draft: WardrobeDraft) => void,
) {
  return withFeedback(
    {
      id: `wardrobe-upload:${draft.id}`,
      label: "Wardrobe photo",
      success:
        "Photo uploaded and verified. Review the description before adding the piece.",
      href: "/wardrobe",
    },
    () => uploadWardrobeFileData(file, draft, onPrepared),
  );
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
export function displayWardrobeItem(item: CanonicalWardrobeItem) {
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

type AttributeKey = keyof ItemValues["attributes"];

const clothingFields: AttributeKey[] = [
  "pattern",
  "apparentMaterial",
  "texture",
  "silhouette",
  "fit",
  "length",
];
const categoryFields: Record<ItemValues["category"], AttributeKey[]> = {
  top: [...clothingFields, "neckline", "collar", "sleeve"],
  bottom: [...clothingFields, "rise", "waistband", "legShape"],
  dress: [...clothingFields, "neckline", "sleeve", "waistDefinition"],
  outerwear: [...clothingFields, "lapel", "closure", "hood"],
  shoes: [
    "shoeType",
    "toeShape",
    "heelType",
    "heelHeightClass",
    "soleType",
    "upperAppearance",
    "fasteningStyle",
  ],
  accessory: [
    "accessoryType",
    "apparentMaterial",
    "shape",
    "scale",
    "placement",
  ],
};
const accessoryFields: Array<{
  matches: RegExp;
  keys: AttributeKey[];
}> = [
  {
    matches: /\b(bag|handbag|tote|clutch|backpack|satchel|purse)\b/i,
    keys: [
      "bagType",
      "bagScale",
      "apparentMaterial",
      "structure",
      "carryMode",
      "strapType",
      "handleType",
      "closure",
    ],
  },
  {
    matches:
      /\b(jewelry|jewellery|necklace|pendant|earring|earrings|ring|bracelet|bangle|watch|brooch)\b/i,
    keys: [
      "accessoryType",
      "metalAppearance",
      "stoneAppearance",
      "shape",
      "scale",
      "motif",
      "placement",
    ],
  },
  {
    matches:
      /\b(hat|cap|headwear|head covering|scarf|scarves|hijab|shawl|wrap)\b/i,
    keys: [
      "accessoryType",
      "shape",
      "brim",
      "wrapStyle",
      "lengthClass",
      "coverage",
      "edgeFinish",
    ],
  },
  {
    matches: /\b(belt|hosiery|tie|necktie|socks|stockings|tights)\b/i,
    keys: [
      "accessoryType",
      "widthClass",
      "buckleShape",
      "lengthClass",
      "opacity",
      "patternScale",
    ],
  },
];

function manualAttributeKeys(values: ItemValues): AttributeKey[] {
  const accessoryName = [
    values.subcategory,
    values.attributes.accessoryType,
    values.attributes.bagType,
  ].join(" ");
  const categoryKeys =
    values.category === "accessory"
      ? (accessoryFields.find(({ matches }) => matches.test(accessoryName))
          ?.keys ?? categoryFields.accessory)
      : categoryFields[values.category];
  return ["primaryColor", "secondaryColors", ...categoryKeys, "occasion"];
}

export function intakeFields(
  values: ItemValues,
  provenance?: CanonicalWardrobeItem["provenance"],
  original?: ItemValues | null,
): WardrobeField[] {
  const originalFields = original ? itemFields(original) : [];
  const defaults =
    !original ||
    values.category !== original.category ||
    values.subcategory !== original.subcategory
      ? manualAttributeKeys(values)
      : [];
  const previousKeys = originalFields
    .filter(
      (field) => field.key.startsWith("attributes.") && field.value.trim(),
    )
    .map((field) => field.key.replace("attributes.", ""));
  const fields = [
    {
      key: "subcategory",
      label: "Subcategory",
      value: values.subcategory ?? "",
      source: provenance?.subcategory?.source,
      editable: true,
    },
    ...itemFields({
      ...values,
      attributes: {
        ...Object.fromEntries(
          [...defaults, ...previousKeys].map((key) => [
            key,
            listKeys.has(key) ? [] : null,
          ]),
        ),
        ...values.attributes,
      },
      provenance,
    }),
  ];
  const defaultPaths = new Set(defaults.map((key) => `attributes.${key}`));
  return fields
    .filter(
      (field) =>
        field.key === "subcategory" ||
        field.key === "description" ||
        defaultPaths.has(field.key) ||
        field.value.trim() ||
        originalFields.some(
          (previous) => previous.key === field.key && previous.value.trim(),
        ),
    )
    .map((field) => {
      const before =
        field.key === "subcategory"
          ? (original?.subcategory ?? "")
          : originalFields.find((previous) => previous.key === field.key)
              ?.value;
      return {
        ...field,
        group: field.label,
        source:
          field.value.trim() && (!original || field.value !== before)
            ? ("user" as const)
            : field.source,
      };
    });
}
