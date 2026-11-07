import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { prepareReferenceImage } from "./reference-image";

vi.mock("server-only", () => ({}));

describe("prepareReferenceImage", () => {
  it("caps the longest side and returns JPEG bytes", async () => {
    const source = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 4,
        background: { r: 200, g: 20, b: 40, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const result = await prepareReferenceImage(new Uint8Array(source));
    const meta = await sharp(result.bytes).metadata();
    expect(result.mimeType).toBe("image/jpeg");
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(683);
    expect(result.bytes.byteLength).toBeLessThan(source.byteLength);
  });

  it("does not enlarge a small image", async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 400,
        channels: 3,
        background: "#336699",
      },
    })
      .webp()
      .toBuffer();
    const meta = await sharp(
      (await prepareReferenceImage(new Uint8Array(source))).bytes,
    ).metadata();
    expect([meta.width, meta.height]).toEqual([300, 400]);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(
      prepareReferenceImage(new Uint8Array([1, 2, 3])),
    ).rejects.toThrow();
  });
});
