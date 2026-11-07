import type { getSavedLook, listSavedLooks } from "./server";
import type { SavedLook } from "./saved-looks";

export type SavedLookResponse = Awaited<ReturnType<typeof getSavedLook>>;
export type SavedLooksResponse = Awaited<ReturnType<typeof listSavedLooks>>;
export type SavedFilter = "all" | "shared" | "preparing";

const savedDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

export function toSavedLookView(saved: SavedLookResponse): SavedLook {
  return {
    id: saved.id,
    title: saved.title,
    subtitle: saved.rationale || undefined,
    savedAt: savedDate.format(new Date(saved.createdAt)),
    avatarUrl: saved.media.imageUrl,
    mediaStatus: saved.media.status,
    canRetry: saved.media.canRetry,
    sample: saved.sourceType === "sample",
    items: saved.items.map((item, index) => ({
      id:
        typeof item.optionItemId === "string"
          ? item.optionItemId
          : `${saved.id}-${index}`,
      name:
        typeof item.name === "string"
          ? item.name
          : "Item description unavailable",
      category: typeof item.category === "string" ? item.category : "",
      imageUrl: item.imageUrl,
      status: item.ownedAtSave
        ? "owned"
        : item.sourceReference.kind === "product"
          ? "candidate"
          : "missing",
    })),
    share: saved.activeShare
      ? {
          active: true,
          expiresLabel: `expires ${savedDate.format(new Date(saved.activeShare.expiresAt))}`,
        }
      : { active: false },
  };
}

export function savedCollectionHref(
  filter: SavedFilter,
  limit: number,
  cursor?: string | null,
) {
  const query = new URLSearchParams({ filter, limit: String(limit) });
  if (cursor) query.set("cursor", cursor);
  return `/saved-looks?${query}`;
}

export function savedReturnHref(value?: string | string[]) {
  if (typeof value !== "string") return "/saved-looks";
  try {
    const url = new URL(value, "https://stylora.invalid");
    if (
      url.origin === "https://stylora.invalid" &&
      url.pathname === "/saved-looks"
    )
      return `${url.pathname}${url.search}`;
  } catch {
    /* Invalid return coordinates use the collection entry. */
  }
  return "/saved-looks";
}
