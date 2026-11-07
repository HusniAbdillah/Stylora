import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../src/prompts", import.meta.url), { recursive: true });
for (const name of ["FASHION-PROMPT", "FASHION", "FASHION-STRUCTURE"]) {
  await copyFile(
    new URL(`../docs/${name}.md`, import.meta.url),
    new URL(`../src/prompts/${name}.md`, import.meta.url),
  );
}
