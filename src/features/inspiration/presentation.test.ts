import { describe, expect, it } from "vitest";
import { lookSchema } from "./client-contract";
import {
  presentConfidence,
  presentIdeas,
  presentMatches,
} from "./presentation";

const id = "6762a315-1490-409b-909b-f424450b06af";
const explanation = {
  summary: "Fixture analysis.",
  sourceRevision: 1,
  inputsUsed: ["inspiration"],
  differences: [],
  uncertainty: [],
  whyThis: [1, 2].map(() => ({
    reason: "The fixture includes a visible garment.",
    evidence: [{ source: "inspiration", id, path: "image" }],
  })),
};
const look = lookSchema.parse({
  id,
  title: "Fixture history",
  occasion: null,
  revision: 1,
  status: "options_ready",
  sourceType: "live",
  inspirationImage: null,
  pieces: [],
  operations: [],
  marketplaceIntegration: "pending",
  confidenceReview: {
    id,
    stale: true,
    sourceRevision: 1,
    explanation,
    insights: [
      { title: "Previous insight", description: "A saved fixture insight." },
    ],
    occasions: [],
  },
  matches: [
    {
      id,
      pieceId: id,
      outcome: "missing",
      wardrobeItem: null,
      inventoryMode: "combined",
      explanation,
      sharedAttributes: [],
      differences: [],
      rejectedCandidates: [],
      stale: true,
      sourceType: "live",
    },
  ],
  outfitOptions: [
    {
      id,
      optionType: "closest",
      title: "Previous direction",
      concept: "Saved fixture composition.",
      explanation,
      status: "ready",
      stale: true,
      revision: 1,
      items: [],
      inventoryMode: "combined",
    },
  ],
});

describe("Create analysis history", () => {
  it("retains stale confidence content with an explicit previous-review state", () => {
    expect(presentConfidence(look, undefined)).toMatchObject({
      stale: true,
      status: "unavailable",
      insights: [{ title: "Previous insight" }],
      errorMessage: expect.stringContaining("Previous review"),
    });
  });
  it("excludes stale results from current-only consumers but allows read-only history presentation", () => {
    expect(presentMatches(look, "combined")).toEqual([]);
    expect(presentIdeas(look, [], "combined")).toEqual([]);
    expect(presentMatches(look, "combined", true)).toHaveLength(1);
    expect(presentIdeas(look, [], "combined", true)).toMatchObject([
      { title: "Previous direction" },
    ]);
    expect(presentIdeas(look, [], "live", true)).toEqual([]);
  });
});
