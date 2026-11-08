import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getFashionTaskSettings } from "./task-settings";

afterEach(() => vi.unstubAllEnvs());

describe("fashion task settings", () => {
  it("uses task-specific overrides before the text model and legacy model", () => {
    vi.stubEnv("OPENAI_MODEL", "legacy-model");
    vi.stubEnv("OPENAI_TEXT_MODEL", "text-model");
    vi.stubEnv("OPENAI_DESCRIPTION_MODEL", "description-model");
    vi.stubEnv("OPENAI_DESCRIPTION_REASONING_EFFORT", "none");
    vi.stubEnv("OPENAI_DESCRIPTION_MAX_OUTPUT_TOKENS", "16000");
    expect(getFashionTaskSettings("inspiration_description")).toEqual({
      version: "fashion-request.v1",
      model: "description-model",
      reasoningEffort: "none",
      maxOutputTokens: 16000,
    });
    expect(getFashionTaskSettings("wardrobe_description")).toEqual(
      getFashionTaskSettings("inspiration_description"),
    );
    expect(getFashionTaskSettings("inspiration_confidence").model).toBe(
      "text-model",
    );
    vi.stubEnv("OPENAI_TEXT_MODEL", "");
    expect(getFashionTaskSettings("wardrobe_match").model).toBe("legacy-model");
  });

  it("shares outfit controls for initial generation and one-direction regeneration", () => {
    vi.stubEnv("OPENAI_OUTFIT_MODEL", "outfit-model");
    vi.stubEnv("OPENAI_OUTFIT_REASONING_EFFORT", "low");
    vi.stubEnv("OPENAI_OUTFIT_MAX_OUTPUT_TOKENS", "24000");
    expect(getFashionTaskSettings("outfit_options")).toEqual(
      getFashionTaskSettings("option_regeneration"),
    );
  });

  it.each([
    ["OPENAI_MATCH_REASONING_EFFORT", "fastest"],
    ["OPENAI_MATCH_MAX_OUTPUT_TOKENS", "unbounded"],
    ["OPENAI_MATCH_MAX_OUTPUT_TOKENS", "128001"],
    ["OPENAI_MATCH_MODEL", "model with spaces"],
  ])("rejects invalid %s without silently falling back", (name, value) => {
    vi.stubEnv(name, value);
    expect(() => getFashionTaskSettings("wardrobe_match")).toThrow(
      expect.objectContaining({ code: "provider_unavailable" }),
    );
  });
});
