import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(
  new URL("../assets/icon-maskable.svg", import.meta.url),
  "utf8",
);
const square = source.replace(' rx="113"', "");
const small = source.replace(
  'x="132.5" y="97.5" width="247" height="317"',
  'x="92" y="46" width="328" height="420"',
);
const output = new URL("../public/", import.meta.url);
await mkdir(new URL("icons/", output), { recursive: true });

async function png(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

for (const size of [192, 512]) {
  await writeFile(
    new URL(`icons/icon-${size}.png`, output),
    await png(source, size),
  );
}
await writeFile(
  new URL("icons/icon-maskable-512.png", output),
  await png(square, 512),
);
await writeFile(
  new URL("apple-touch-icon.png", output),
  await png(square, 180),
);
await writeFile(new URL("favicon-32.png", output), await png(small, 32));
await writeFile(new URL("favicon.svg", output), small);

const frames = await Promise.all([16, 32, 48].map((size) => png(small, size)));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = [16, 32, 48][index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(
  new URL("favicon.ico", output),
  Buffer.concat([header, ...frames]),
);
