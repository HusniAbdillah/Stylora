import { describe, expect, it } from "vitest";
import { lookSchema } from "./client-contract";
import {
  presentConfidence,
  presentIdeas,
  presentInputSignals,
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
  it("uses supplied human preference labels and combines fields for the same choice", () => {
    const signals = [
      "skinSwatchHex",
      "skinSwatchId",
      "bodyIllustrationGroup",
      "bodyIllustrationId",
      "undertone",
      "fit",
      "styles",
      "contrast",
      "unknownInternalKey",
    ];
    expect(
      presentInputSignals(signals, {
        skinSwatchId: "depth_03",
        skinSwatchHex: "#CFA080",
        bodyIllustrationGroup: "women",
        bodyIllustrationId: "pear",
        undertone: "warm",
        fit: "relaxed",
        styles: ["minimal"],
        contrast: "unsure",
      }),
    ).toEqual([
      "Skin tone",
      "Body reference",
      "Undertone",
      "Fit preference",
      "Clothing style",
    ]);
    expect(
      presentInputSignals(["styles", "fit", "undertone"], {
        styles: [],
        fit: null,
      }),
    ).toEqual([]);
  });
  it("uses the same labels for idea input summaries and preserves model uncertainty text", () => {
    const uncertainty = "Fixture model uncertainty remains verbatim.";
    const current = lookSchema.parse({
      ...look,
      outfitOptions: [
        {
          ...look.outfitOptions[0],
          stale: false,
          explanation: {
            ...explanation,
            inputsUsed: [
              "inspiration",
              "wardrobe",
              "occasion",
              "skinSwatchId",
              "skinSwatchHex",
              "bodyIllustrationGroup",
              "bodyIllustrationId",
              "fit",
            ],
            uncertainty: [uncertainty],
          },
        },
      ],
    });
    const [idea] = presentIdeas(current, [], "combined");
    expect(idea.inputsUsed).toEqual([
      "Inspiration",
      "Wardrobe",
      "Occasion",
      "Skin tone",
      "Body reference",
      "Fit preference",
    ]);
    expect(idea.uncertainty).toEqual([uncertainty]);
  });
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
