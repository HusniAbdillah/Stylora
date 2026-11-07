import { z } from "zod";

const categories = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "bags",
  "accessories",
];

export function preferencesReturnHref(destination?: string) {
  if (
    !destination ||
    !destination.startsWith("/") ||
    destination.startsWith("//") ||
    destination.includes("\\") ||
    [...destination].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  const base = "https://stylora.invalid";
  let url: URL;
  try {
    url = new URL(destination, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  const params = new URLSearchParams();
  if (url.pathname === "/preview") {
    const draftId = url.searchParams.get("draftId");
    if (draftId && !z.uuid().safeParse(draftId).success) return null;
    if (draftId) params.set("draftId", draftId);
    const category = url.searchParams.get("category");
    if (category && categories.includes(category))
      params.set("category", category);
  } else {
    const lookId = /^\/(?:looks|create)\/([^/]+)$/.exec(url.pathname)?.[1];
    if (
      url.pathname !== "/create" &&
      (!lookId || !z.uuid().safeParse(lookId).success)
    )
      return null;
    for (const key of ["draft", "option_id"]) {
      const value = url.searchParams.get(key);
      if (value && z.uuid().safeParse(value).success) params.set(key, value);
    }
    const step = url.searchParams.get("step");
    if (
      lookId &&
      step &&
      ["upload", "review", "matches", "ideas", "details"].includes(step)
    )
      params.set("step", step);
  }
  return `${url.pathname}${params.size ? `?${params}` : ""}`;
}
