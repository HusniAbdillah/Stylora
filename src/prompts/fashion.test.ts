import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import bundled from "./fashion.generated.json";

it("bundles the current canonical fashion sources", () => {
  for (const name of [
    "FASHION-PROMPT",
    "FASHION",
    "FASHION-STRUCTURE",
  ] as const) {
    const current = readFileSync(
      new URL(`../../docs/${name}.md`, import.meta.url),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(bundled[name].replace(/\r\n/g, "\n")).toBe(current);
  }
});
