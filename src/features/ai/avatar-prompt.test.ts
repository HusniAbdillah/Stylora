import { describe, expect, it, vi } from "vitest";
import { buildFashionPrompt } from "@/prompts/fashion";
import { AVATAR_FIGURE_DIRECTION, buildAvatarImagePrompt } from "./openai";
import type { AvatarVisualDirection } from "@/features/preview/visual-direction";

vi.mock("server-only", () => ({}));

const direction = {
  version: "visual-direction.v1",
  mode: "neutral",
  preferences: {},
  pose: { id: "standing-clear", instructions: "Relaxed standing." },
  composition: { selectedSlots: ["top"], omittedSlots: ["shoes"] },
} as unknown as AvatarVisualDirection;

describe("avatar image prompt", () => {
  const instructions = buildFashionPrompt("preview_image").instructions;
  const prompt = buildAvatarImagePrompt({
    instructions,
    items: [{ category: "top" }],
    visualDirection: direction,
  });

  it("states one fixed figure with a featureless head in its own block", () => {
    expect(prompt).toContain(`<figure>\n${AVATAR_FIGURE_DIRECTION}\n</figure>`);
    expect(AVATAR_FIGURE_DIRECTION).toMatch(/featureless oval head/);
    expect(AVATAR_FIGURE_DIRECTION).toMatch(/never omit the head/i);
  });

  it("keeps the full fashion instructions and the outfit data", () => {
    expect(prompt.startsWith(instructions)).toBe(true);
    expect(prompt).toContain('"items":[{"category":"top"}]');
    expect(prompt.indexOf("<figure>")).toBeLessThan(prompt.indexOf("<outfit>"));
  });

  it("carries the same figure rule in the runtime instructions", () => {
    expect(instructions).toContain("featureless oval head");
    expect(instructions).toContain("never omit the head");
  });

  it("keeps the slot and footwear rules from the audited direction", () => {
    expect(prompt).toContain("selectedSlots list is exhaustive");
    expect(prompt).toContain("Show bare mannequin feet");
  });

  it("stays below the image prompt limit", () => {
    expect(prompt.length).toBeLessThan(31800);
  });
});
