import { describe, expect, it } from "vitest";
import { PieceStreamError, PieceStreamParser } from "./piece-stream";
import { descriptionPieceSchema } from "./fashion-schema";

const evidence = {
  source: "visual_inference",
  state: "observed",
  confidence: 0.8,
  evidence: "Visible in the reference image.",
  uncertainty: null,
};

const piece = {
  name: 'Ivory "shirt" {relaxed}',
  category: "top",
  subcategory: "shirt",
  description: "A shirt with a \\ detail and } in its description.",
  attributes: [
    { key: "colors", value: ["ivory"], ...evidence },
    { key: "fit", value: "relaxed", ...evidence },
  ],
  coreEvidence: {
    name: evidence,
    category: evidence,
    subcategory: evidence,
    description: evidence,
  },
  confidence: null,
  uncertainty: ["Material is unknown."],
};

describe("complete garment streaming", () => {
  it("handles nested objects, escaped quotes, braces and single-character chunks", () => {
    const parser = new PieceStreamParser();
    const serialized = JSON.stringify({
      pieces: [piece, { ...piece, name: "Second shirt" }],
    });
    const emitted = [...serialized].flatMap((character) =>
      parser.append(character),
    );
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toEqual(descriptionPieceSchema.parse(piece));
    expect(emitted[1].name).toBe("Second shirt");
  });

  it("does not emit an incomplete object", () => {
    const parser = new PieceStreamParser();
    expect(
      parser.append('{"pieces":[' + JSON.stringify(piece).slice(0, -1)),
    ).toEqual([]);
    expect(parser.append("}")).toEqual([descriptionPieceSchema.parse(piece)]);
  });

  it("rejects complete objects that fail the garment contract", () => {
    expect(() =>
      new PieceStreamParser().append('{"pieces":[{"category":"invented"}]}'),
    ).toThrow(PieceStreamError);
  });
});
