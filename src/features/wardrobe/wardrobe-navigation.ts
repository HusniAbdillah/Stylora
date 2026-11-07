export const WARDROBE_LIST_URL_KEY = "stylora.preview.wardrobe.list-url";
export const WARDROBE_RETURN_URL_KEY = "stylora.preview.wardrobe.return-url";
export const WARDROBE_RETURN_SCROLL_KEY =
  "stylora.preview.wardrobe.return-scroll";

export function rememberWardrobeCollectionHref() {
  if (typeof window === "undefined" || window.location.pathname !== "/wardrobe")
    return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    if (url.searchParams.get("status") === "archived")
      url.searchParams.delete("status");
    window.sessionStorage.setItem(
      WARDROBE_LIST_URL_KEY,
      url.pathname + url.search,
    );
  } catch {
    // Navigation still works without session storage.
  }
}

export function getWardrobeCollectionHref() {
  if (typeof window === "undefined") return "/wardrobe";
  try {
    const stored = window.sessionStorage.getItem(WARDROBE_LIST_URL_KEY);
    if (!stored) return "/wardrobe";
    const url = new URL(stored, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== "/wardrobe")
      return "/wardrobe";
    url.searchParams.delete("add");
    if (url.searchParams.get("status") === "archived")
      url.searchParams.delete("status");
    return url.pathname + url.search;
  } catch {
    return "/wardrobe";
  }
}
