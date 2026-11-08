import { afterEach, describe, expect, it, vi } from "vitest";
import { safeProviderError, withFashionOperation } from "@/lib/ai/provider";
import { createEvidenceProjection } from "@/features/matching/evidence";
import { generateOptions, type GenerateOptionsInput } from "./backend";

vi.mock("server-only", () => ({}));

const topId = "27521082-6561-47ac-a732-ae19901b7849";
const bottomId = "e76c4e28-79f8-4f4c-8bbd-61b44504ae26";
const heelsId = "91fc631a-4211-44be-9ab3-af582fa579c2";
const top = {
  id: topId,
  name: "Fixture ivory shirt",
  category: "top" as const,
  subcategory: "shirt",
  attributes: { primaryColor: "ivory" },
  sourceType: "manual" as const,
  revision: 1,
  inventoryStatus: "owned" as const,
};
const inventory = [
  top,
  {
    ...top,
    id: bottomId,
    name: "Fixture navy trousers",
    category: "bottom" as const,
    subcategory: "trousers",
    attributes: { primaryColor: "navy" },
  },
  {
    ...top,
    id: heelsId,
    name: "Fixture high heels",
    category: "shoes" as const,
    subcategory: "pumps",
    attributes: { heelHeightClass: "high" },
  },
];
const context = {
  pieces: [top],
  inventory,
  preferences: { footwearComfort: ["Flats only"] },
  occasion: null,
  sourceRevision: 1,
  inventoryMode: "combined" as const,
};
const evidence = createEvidenceProjection(context);
const referenceKeys = ["category", "attributes.primaryColor"].map(
  (path) =>
    evidence.catalog.find(
      (entry) =>
        entry.reference.source === "inspiration" &&
        entry.reference.path === path,
    )!.key,
);
const explanation = {
  summary: "The shirt anchors a proposed pairing.",
  whyThis: [
    {
      reason: "The supplied shirt provides the upper garment.",
      evidence: [referenceKeys[0]],
    },
    {
      reason: "The ivory shirt sets the light palette anchor.",
      evidence: [referenceKeys[1]],
    },
  ],
  inputsUsed: ["inspiration"],
  differences: [],
  uncertainty: [],
  sourceRevision: 1,
};
function option(complete = true) {
  return {
    title: "Fixture tailored pairing",
    concept: "An ivory shirt with navy trousers.",
    status: "ready",
    explanation,
    items: inventory.slice(0, complete ? 2 : 1).map((item) => ({
      slotId: `${item.category}_1`,
      category: item.category,
      itemKind: "owned",
      pieceId: item.category === "top" ? topId : null,
      wardrobeItemId: item.id,
      missingBrief: null,
      rationale: "Uses the supplied owned garment.",
    })),
  };
}
function completed(complete: boolean) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ options: { closest: option(complete) } }),
          },
        ],
      },
    ],
  });
}
function setup(responses: Response[]) {
  vi.stubEnv("OPENAI_API_KEY", "fixture-provider-key");
  vi.stubEnv("OPENAI_OUTFIT_MODEL", "fixture-model");
  const fetch = vi.fn();
  for (const response of responses) fetch.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetch);
  const metadata = vi.fn();
  const input: GenerateOptionsInput = {
    ...context,
    optionType: "closest",
    onProviderMetadata: metadata,
    matches: [
      {
        pieceId: topId,
        wardrobeItemId: topId,
        outcome: "owned_match",
        score: 1,
        sharedAttributes: ["category"],
        differences: [],
        evidenceCoverage: 1,
        rejectedCandidates: [],
        sourceType: "manual",
        explanation: {
          ...explanation,
          whyThis: explanation.whyThis.map((reason, index) => ({
            ...reason,
            evidence: [
              evidence.catalog.find(
                (entry) => entry.key === referenceKeys[index],
              )!.reference,
            ],
          })),
        },
      },
    ],
  };
  const operation = {
    operationId: "fixture-operation",
    reserveCall: vi.fn(async () => {}),
    releaseCall: vi.fn(async () => {}),
  };
  return { input, operation, fetch, metadata };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("outfit composition correction", () => {
  it("corrects incomplete coverage once with a precise safe path and consistent eligible IDs", async () => {
    const { input, operation, fetch, metadata } = setup([
      completed(false),
      completed(true),
    ]);
    const result = await withFashionOperation(operation, () =>
      generateOptions(input),
    );
    expect(result[0].items.map((item) => item.wardrobeItemId)).toEqual([
      topId,
      bottomId,
    ]);
    expect(operation.reserveCall).toHaveBeenCalledTimes(2);
    expect(operation.releaseCall).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(second.input[0].content[0]).toEqual(first.input[0].content[0]);
    const correction = second.input[0].content[1].text;
    expect(correction).toContain('"code":"incomplete_clothing_coverage"');
    expect(correction).toContain('"path":"options.closest.items"');
    expect(correction).not.toContain("Fixture ivory shirt");
    const supplied = JSON.parse(
      first.input[0].content[0].text
        .replace(/^<untrusted_context>\n/, "")
        .replace(/\n<\/untrusted_context>$/, ""),
    );
    expect(supplied.allowedOwnedIds).toEqual([topId, bottomId]);
    expect(supplied.allowedOwnedIds).not.toContain(heelsId);
    expect(metadata).toHaveBeenCalledWith(
      expect.objectContaining({ correctionAttemptCount: 1, attemptCount: 2 }),
    );
  });

  it("keeps invalid coverage terminal after the one correction instead of requesting a third result", async () => {
    const { input, operation, fetch } = setup([
      completed(false),
      completed(false),
      completed(true),
    ]);
    const failure = await withFashionOperation(operation, () =>
      generateOptions(input),
    ).catch((error: unknown) => error);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(safeProviderError(failure)).toMatchObject({
      code: "invalid_outfit_composition",
      providerCode: "domain_validation",
      correctionAttempt: true,
      validationIssues: [
        { code: "incomplete_clothing_coverage", path: "options.closest.items" },
      ],
    });
  });
});
