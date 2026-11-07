import "server-only";
import sharp from "sharp";

const MAX_SIDE = 1024;

/**
 * Shrinks a garment reference before it goes to the image model. Large phone
 * photos slow the upload and the edit call without adding garment detail, so
 * the longest side is capped and transparency is flattened onto white.
 * Orientation is applied and metadata dropped.
 */
export async function prepareReferenceImage(bytes: Uint8Array) {
  const output = await sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return { bytes: new Uint8Array(output), mimeType: "image/jpeg" as const };
}
