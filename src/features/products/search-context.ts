import { createHash } from "node:crypto";
import type { Category } from "./schema";

export type ShoppingTarget = "men" | "women" | null;
export type ShoppingPreferences = {
  revision: number;
  target: ShoppingTarget;
  fit: string | null;
  styles: string[];
};

export const MARKETPLACE_POLICY = "shopee-id-v1";
const genderWords =
  /\b(?:men(?:'s|s)?|menswear|male|pria|laki[- ]?laki|cowok|boys?|women(?:'s|s)?|womenswear|female|ladies|girls?|wanita|perempuan|cewek|unisex)\b/gi;

export function shoppingPreferences(
  preferences: Record<string, unknown>,
  revision: number,
): ShoppingPreferences {
  const group = preferences.bodyIllustrationGroup;
  return {
    revision,
    target: group === "men" || group === "women" ? group : null,
    fit: ["fitted", "regular", "relaxed", "oversized"].includes(
      String(preferences.fit),
    )
      ? String(preferences.fit)
      : null,
    styles: Array.isArray(preferences.styles)
      ? [
          ...new Set(
            preferences.styles.filter(
              (value): value is string =>
                typeof value === "string" &&
                /^[a-z][a-z -]{0,39}$/i.test(value) &&
                !/^(?:unsure|unknown|skip|no preference)$/i.test(value),
            ),
          ),
        ]
          .sort()
          .slice(0, 2)
      : [],
  };
}

const categoryWords: Record<Category, string> = {
  top: "atasan",
  bottom: "celana rok",
  dress: "dress",
  outerwear: "jaket",
  shoes: "sepatu",
  accessory: "aksesori",
};

export function buildShoppingQuery(
  brief: string,
  category: Category,
  preferences: ShoppingPreferences,
) {
  let base = brief
    .replace(genderWords, " ")
    .replace(/\bshopee(?:\.co\.id| indonesia| mall)?\b/gi, " ");
  for (const term of [preferences.fit, ...preferences.styles]) {
    if (term)
      base = base.replace(
        new RegExp(
          `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
          "gi",
        ),
        " ",
      );
  }
  base = base.replace(/\s+/g, " ").trim();
  const target =
    preferences.target === "men"
      ? "pria"
      : preferences.target === "women"
        ? "wanita"
        : "";
  const additions = [preferences.fit, ...preferences.styles, target, "Shopee"]
    .filter(Boolean)
    .join(" ");
  return `${(base || categoryWords[category]).slice(0, 239 - additions.length).trim()} ${additions}`.trim();
}

export function isShopeeSource(source: string) {
  return /^(?:shopee|shopee indonesia|shopee\.co\.id|shopee mall)$/i.test(
    source.trim().replace(/\s+/g, " "),
  );
}

export function matchesShoppingTarget(title: string, target: ShoppingTarget) {
  if (!target || /\bunisex\b/i.test(title)) return true;
  const men =
    /\b(?:men(?:'s|s)?|menswear|male|pria|laki[- ]?laki|cowok|boys?)\b/i.test(
      title,
    );
  const women =
    /\b(?:women(?:'s|s)?|womenswear|female|ladies|girls?|wanita|perempuan|cewek)\b/i.test(
      title,
    );
  return target === "men" ? !women || men : !men || women;
}

export function shoppingContextKey(preferences: ShoppingPreferences) {
  return createHash("sha256")
    .update(JSON.stringify({ marketplace: MARKETPLACE_POLICY, ...preferences }))
    .digest("hex");
}

export function shoppingSearchFingerprint(input: {
  workspace: string;
  lookId: string;
  option: string;
  revision: number;
  slot: string;
  item: string;
  itemRevision: number;
  brief: unknown;
  query: string;
  preferences: ShoppingPreferences;
}) {
  const {
    workspace,
    lookId,
    option,
    revision,
    slot,
    item,
    itemRevision,
    brief,
    query,
    preferences,
  } = input;
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspace,
        lookId,
        option,
        revision,
        slot,
        item,
        itemRevision,
        brief,
        query,
        preferences,
        marketplace: MARKETPLACE_POLICY,
        country: "id",
      }),
    )
    .digest("hex");
}
