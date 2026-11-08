import { describe, expect, it } from "vitest";
import {
  capsuleFixtureBrief,
  capsuleFixtureItems,
} from "./generation-fixtures";
import {
  capsuleResultContextKey,
  capsuleResultNeedsGeneration,
} from "./result-state";

const outfitIds = [1, 2, 3].map(
  (number) => `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
);
const runtime = {
  model: "text-model",
  promptVersion: "capsule-prompt.v2",
  schemaVersion: "fashion-item.v1",
  knowledgeVersion: "fixture-knowledge",
};
const current = {
  brief: capsuleFixtureBrief,
  revision: 4,
  preferenceRevision: 8,
  itemRevisions: Object.fromEntries(
    capsuleFixtureItems.map((item) => [item.id, item.revision]),
  ),
  runtime,
};
const completed = {
  input_revision: 4,
  model: runtime.model,
  prompt_version: runtime.promptVersion,
  schema_version: runtime.schemaVersion,
  input: {
    brief: current.brief,
    preferenceRevision: 8,
    itemRevisions: current.itemRevisions,
    knowledgeVersion: runtime.knowledgeVersion,
  },
  result_ref: { outfitIds },
};

describe("Capsule result freshness", () => {
  it("restarts an interrupted brief edit even when the current outfit list is empty", () => {
    expect(capsuleResultNeedsGeneration(completed, current, outfitIds)).toBe(
      false,
    );
    const edited = {
      ...current,
      revision: 5,
      brief: { ...current.brief, weather: "Cold" },
    };
    expect(capsuleResultNeedsGeneration(completed, edited, [])).toBe(true);
    expect(
      capsuleResultNeedsGeneration(completed, { ...current, revision: 5 }, []),
    ).toBe(true);
  });

  it("preserves individually deleted outfits including an intentionally emptied capsule", () => {
    expect(
      capsuleResultNeedsGeneration(
        completed,
        { ...current, revision: 5 },
        outfitIds.slice(1),
      ),
    ).toBe(false);
    expect(
      capsuleResultNeedsGeneration(completed, { ...current, revision: 7 }, []),
    ).toBe(false);
  });

  it("invalidates preference, item and runtime changes regardless of outfit count", () => {
    expect(
      capsuleResultNeedsGeneration(
        completed,
        { ...current, revision: 7, preferenceRevision: 9 },
        [],
      ),
    ).toBe(true);
    expect(
      capsuleResultNeedsGeneration(
        completed,
        {
          ...current,
          itemRevisions: {
            ...current.itemRevisions,
            [capsuleFixtureItems[0].id]: 2,
          },
        },
        outfitIds,
      ),
    ).toBe(true);
    expect(
      capsuleResultNeedsGeneration(
        completed,
        {
          ...current,
          runtime: { ...runtime, promptVersion: "capsule-prompt.v3" },
        },
        outfitIds,
      ),
    ).toBe(true);
  });

  it("changes the browser request identity for new dependencies at the same capsule revision", () => {
    const key = capsuleResultContextKey(current);
    expect(
      capsuleResultContextKey({ ...current, preferenceRevision: 9 }),
    ).not.toBe(key);
    expect(
      capsuleResultContextKey({
        ...current,
        itemRevisions: Object.fromEntries(
          Object.entries(current.itemRevisions).reverse(),
        ),
      }),
    ).toBe(key);
  });
});
