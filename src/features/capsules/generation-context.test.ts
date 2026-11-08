import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  capsuleFingerprint,
  capsuleGenerationConfig,
  capsuleProviderContext,
  compactCapsuleItem,
  readCapturedCapsule,
} from "./generation-context";
import {
  capsuleFixtureBrief as brief,
  capsuleFixtureItems as items,
} from "./generation-fixtures";

const versions = {
  prompt: "fixture-prompt",
  schema: "fashion-item.v1",
  knowledge: "a".repeat(64),
  model: "gpt-5-mini",
};
const sourceItems = items.map(
  ({ inferred_attributes: _inferred, ...item }) => item,
);
function legacy() {
  return {
    brief,
    capsuleRevision: 1,
    items: items.map(({ inferred_attributes: _inferred, ...item }) => item),
    knowledgeVersion: versions.knowledge,
    itemRevisions: Object.fromEntries(
      items.map((item) => [item.id, item.revision]),
    ),
    preferences: {},
    preferenceRevision: 1,
    allowedSignals: ["Owned wardrobe"],
    instructions: "Use the supplied owned IDs.",
  };
}
function capture() {
  return {
    ...legacy(),
    items: legacy().items.map(compactCapsuleItem),
    contractVersion: "capsule-context.v2",
    generationConfig: capsuleGenerationConfig(versions.model, 3),
    sourceVersions: {
      promptVersion: "stylora-fashion-v1",
      knowledgeVersion: "fashion-knowledge-fixture",
      schemaVersion: "fashion-item.v1",
      promptSourceHash: "b".repeat(64),
      knowledgeSourceHash: versions.knowledge,
      schemaSourceHash: "c".repeat(64),
      promptAssemblyHash: "d".repeat(64),
    },
  };
}
describe("captured Capsule context", () => {
  it("compacts provenance while preserving corrected facts and uncertainty", () => {
    const item = compactCapsuleItem({
      ...sourceItems[0],
      attributes: {
        primaryColor: "blue",
        apparentMaterial: null,
        pattern: "solid",
      },
      corrections: {
        "attributes.primaryColor": {
          correctedValue: "blue",
          previousValue: "red",
        },
      },
      provenance: {
        "attributes.primaryColor": {
          source: "visual_inference",
          state: "unknown",
          confidence: 0.2,
          evidence: "Private observation narrative.",
        },
        "attributes.pattern": { source: "catalog", state: "observed" },
        description: { source: "sample", state: "reported" },
      },
    });
    expect(item.attributes).toEqual({ primaryColor: "blue", pattern: "solid" });
    expect(item.facts?.user).toContain("attributes.primaryColor");
    expect(item.facts?.uncertain).toContain("attributes.apparentMaterial");
    expect(item.facts?.uncertain).not.toContain("attributes.primaryColor");
    expect(item.facts?.catalog).toContain("attributes.pattern");
    expect(item.facts?.sample).toContain("description");
    expect(item.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(item).not.toHaveProperty("provenance");
    expect(item).not.toHaveProperty("corrections");
    expect(JSON.stringify(item)).not.toContain(
      "Private observation narrative.",
    );
  });
  it("hashes captured dependencies independently of JSONB object key order", () => {
    const input = readCapturedCapsule(capture());
    const reordered = Object.fromEntries(
      Object.entries(JSON.parse(JSON.stringify(input))).reverse(),
    );
    expect(capsuleFingerprint(reordered, versions)).toBe(
      capsuleFingerprint(input, versions),
    );
    expect(
      capsuleFingerprint({ ...input, preferenceRevision: 2 }, versions),
    ).not.toBe(capsuleFingerprint(input, versions));
    const changed = compactCapsuleItem({
      ...sourceItems[0],
      provenance: {
        name: { source: "user", evidence: "Updated observation." },
      },
    });
    expect(changed.sourceFingerprint).not.toBe(
      compactCapsuleItem(sourceItems[0]).sourceFingerprint,
    );
  });
  it("keeps the original legacy fingerprint serialization and provider context", () => {
    const input = legacy();
    const expected = createHash("sha256")
      .update(JSON.stringify({ input, ...versions }))
      .digest("hex");
    expect(capsuleFingerprint(input, versions, true)).toBe(expected);
    expect(capsuleProviderContext(readCapturedCapsule(input))).toEqual(input);
  });
  it("sends text and IDs without bookkeeping or repeated source narratives", () => {
    const input = readCapturedCapsule(capture());
    const provider = capsuleProviderContext(input);
    expect(provider).not.toHaveProperty("itemRevisions");
    expect(provider).not.toHaveProperty("generationConfig");
    expect(provider.items[0]).not.toHaveProperty("sourceFingerprint");
    expect(provider.items[0]).not.toHaveProperty("revision");
    expect(provider.items[0].id).toBe(items[0].id);
    expect(provider.brief.requiredItemIds).toEqual(brief.requiredItemIds);
  });
  it("rejects captures with missing policy or mismatched membership and revisions", () => {
    expect(() =>
      readCapturedCapsule({ ...capture(), generationConfig: undefined }),
    ).toThrow("capsule_context_invalid");
    expect(() =>
      readCapturedCapsule({ ...capture(), itemRevisions: {} }),
    ).toThrow("capsule_context_invalid");
    expect(() =>
      readCapturedCapsule({ ...capture(), items: capture().items.slice(1) }),
    ).toThrow("capsule_context_invalid");
  });
  it("captures bounded task configuration without changing unsupported models", () => {
    expect(capsuleGenerationConfig("gpt-5-mini", 3)).toMatchObject({
      reasoningEffort: "low",
      maxOutputTokens: 6000,
      maxProviderRequests: 2,
      deadlineMs: 200000,
    });
    expect(capsuleGenerationConfig("gpt-5-mini", 6).maxOutputTokens).toBe(9000);
    expect(
      capsuleGenerationConfig("gpt-4.1-mini", 3).reasoningEffort,
    ).toBeNull();
  });
});
