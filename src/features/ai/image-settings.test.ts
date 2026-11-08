import { describe, expect, it } from "vitest";
import { getImageRenderSettings } from "./image-settings";

describe("avatar render configuration", () => {
  it("keeps the default bounded and accepts the explicit comparison quality", () => {
    expect(getImageRenderSettings({}).quality).toBe("medium");
    expect(getImageRenderSettings({}).model).toBe("gpt-image-2.6-flare");
    expect(getImageRenderSettings({}).inputFidelity).toBeNull();
    expect(
      getImageRenderSettings({ OPENAI_IMAGE_MODEL: "gpt-image-1.5-2025-12-16" })
        .inputFidelity,
    ).toBe("high");
    expect(
      getImageRenderSettings({ OPENAI_IMAGE_QUALITY: "high" }).quality,
    ).toBe("high");
  });

  it("rejects unsupported settings before image execution", () => {
    expect(() =>
      getImageRenderSettings({ OPENAI_IMAGE_QUALITY: "ultra" }),
    ).toThrow();
  });
});
