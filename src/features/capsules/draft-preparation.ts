import type { CapsuleDraftState, PreparedCapsule } from "./schema";
import { capsuleBriefReady } from "./schema";
import type { CapsuleItem } from "./capsule-types";

export function capsuleAutoReady(
  brief: CapsuleDraftState["brief"],
  inventory: CapsuleItem[],
) {
  if (
    !capsuleBriefReady(brief) ||
    brief.requiredItemIds.some((id) => !brief.includedItemIds.includes(id)) ||
    brief.excludedItemIds.some((id) => brief.includedItemIds.includes(id))
  )
    return false;
  const owned = new Map(
    inventory
      .filter((item) => item.inventoryStatus === "owned")
      .map((item) => [item.id, item.category]),
  );
  if (brief.includedItemIds.some((id) => !owned.has(id))) return false;
  const categories = new Set(brief.includedItemIds.map((id) => owned.get(id)));
  return (
    categories.has("shoes") &&
    (categories.has("dress") ||
      (categories.has("top") && categories.has("bottom")))
  );
}

export function preparationBaseline(
  latest: CapsuleDraftState,
  receipt?: PreparedCapsule,
) {
  if (receipt && receipt.draftRevision >= latest.revision) {
    return {
      revision: receipt.draftRevision,
      capsuleId: receipt.capsuleId,
      capsuleRevision: receipt.capsuleRevision,
    };
  }
  return {
    revision: latest.revision,
    capsuleId: latest.capsuleId,
    capsuleRevision: latest.capsuleRevision,
  };
}

export function canApplyPreparation(
  latest: CapsuleDraftState,
  captured: CapsuleDraftState,
  receipt: PreparedCapsule,
  dirty: boolean,
) {
  return (
    latest.id === captured.id &&
    !dirty &&
    (latest.revision === captured.revision ||
      latest.revision === receipt.draftRevision) &&
    JSON.stringify(latest.brief) === JSON.stringify(captured.brief)
  );
}
