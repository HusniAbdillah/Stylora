import { readFile, writeFile, mkdir } from "node:fs/promises";

const sources = {};
for (const name of ["FASHION-PROMPT", "FASHION", "FASHION-STRUCTURE"]) {
  sources[name] = (
    await readFile(new URL(`../docs/${name}.md`, import.meta.url), "utf8")
  ).replace(/\r\n/g, "\n");
}
await mkdir(new URL("../src/prompts", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/prompts/fashion.generated.json", import.meta.url),
  JSON.stringify(sources, null, 2) + "\n",
);
