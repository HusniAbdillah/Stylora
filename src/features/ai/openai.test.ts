import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildFashionPrompt } from "@/prompts/fashion";
import { buildAvatarVisualDirection } from "@/features/preview/visual-direction";
import { getImageRenderSettings } from "./image-settings";
import { AVATAR_PROMPT_VERSION, generateFashionImage } from "./openai";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("avatar provider direction", () => {
  const items = [
    { category: "top", subcategory: "T-shirt", attributes: {} },
    { category: "bottom", subcategory: "skirt", attributes: {} },
  ];
  const images = [
    { bytes: new Uint8Array([1]), mimeType: "image/png" as const },
  ];

  function interceptRequest() {
    vi.stubEnv("OPENAI_API_KEY", "fixture-api-key");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ b64_json: "AQ==" }] }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends the bundled fashion instructions, omission rules and captured quality", async () => {
    const fetchMock = interceptRequest();
    const visualDirection = buildAvatarVisualDirection({}, items);
    const output = await generateFashionImage({
      items,
      images,
      visualDirection,
      renderSettings: getImageRenderSettings({
        OPENAI_IMAGE_QUALITY: "high",
        OPENAI_IMAGE_MODEL: "gpt-image-1.5",
      }),
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData))
      throw new Error("Expected image edit form.");
    const prompt = String(body.get("prompt"));
    expect(prompt).toContain(buildFashionPrompt("preview_image").instructions);
    expect(prompt).toContain(JSON.stringify(visualDirection));
    expect(prompt).toContain("not a request to complete an outfit");
    expect(prompt).toContain("Show bare mannequin feet");
    expect(body.get("quality")).toBe("high");
    expect(body.get("input_fidelity")).toBe("high");
    expect(output.promptVersion).toBe(AVATAR_PROMPT_VERSION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requests selected shoes instead of issuing the barefoot instruction", async () => {
    const fetchMock = interceptRequest();
    const complete = [...items, { category: "shoes", attributes: {} }];
    await generateFashionImage({
      items: complete,
      images,
      visualDirection: buildAvatarVisualDirection({}, complete),
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData))
      throw new Error("Expected image edit form.");
    const prompt = String(body.get("prompt"));
    expect(prompt).toContain("Footwear is selected");
    expect(prompt).not.toContain("Show bare mannequin feet");
  });
  it("uses the captured newer image model without a legacy fidelity parameter", async () => {
    const fetchMock = interceptRequest();
    await generateFashionImage({
      items,
      images,
      visualDirection: buildAvatarVisualDirection({}, items),
      renderSettings: getImageRenderSettings({
        OPENAI_IMAGE_MODEL: "gpt-image-2.6-flare",
      }),
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData))
      throw new Error("Expected image edit form.");
    expect(body.get("model")).toBe("gpt-image-2.6-flare");
    expect(body.has("input_fidelity")).toBe(false);
  });
  it("states selected skin, body and fit plainly after the garment context", async () => {
    const fetchMock = interceptRequest();
    await generateFashionImage({
      items,
      images,
      visualDirection: buildAvatarVisualDirection(
        {
          skinSwatchId: "depth_06",
          skinSwatchHex: "#543526",
          undertone: "warm",
          bodyIllustrationGroup: "women",
          bodyIllustrationId: "rectangle",
          fit: "oversized",
        },
        items,
      ),
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (!(body instanceof FormData))
      throw new Error("Expected image edit form.");
    const prompt = String(body.get("prompt"));
    expect(prompt).toContain("deep dark brown");
    expect(prompt).toContain("sRGB #543526");
    expect(prompt).toContain("Shoulders, waist and hips aligned");
    expect(prompt).toContain("selected fit intent is oversized");
    expect(prompt.lastIndexOf("sRGB #543526")).toBeGreaterThan(
      prompt.indexOf("</outfit>"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects contradictory slot partitions before making a request", async () => {
    const fetchMock = interceptRequest();
    const direction = buildAvatarVisualDirection({}, items);
    await expect(
      generateFashionImage({
        items,
        images,
        visualDirection: {
          ...direction,
          composition: { selectedSlots: ["top"], omittedSlots: ["top"] },
        },
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
