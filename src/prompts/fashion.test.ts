import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildFashionPrompt, getFashionVersions } from "./fashion";

vi.mock("server-only", () => ({}));

describe("runtime fashion source integrity", () => {
  it("bundles the actual Markdown sources without edits", () => {
    for (const file of [
      "FASHION-PROMPT.md",
      "FASHION.md",
      "FASHION-STRUCTURE.md",
    ]) {
      expect(readFileSync(join("src", "prompts", file), "utf8")).toBe(
        readFileSync(join("docs", file), "utf8"),
      );
    }
  });

  it("sends full runtime instructions and the correct task knowledge with source versions", () => {
    const core = readFileSync(join("docs", "FASHION-PROMPT.md"), "utf8");
    const description = buildFashionPrompt("inspiration_description");
    const matching = buildFashionPrompt("wardrobe_match");
    expect(description.instructions).toContain(core);
    expect(description.instructions).toContain("## 2. Reading a garment");
    expect(description.instructions).toContain(
      "## 7. Evidence, corrections, and effective values",
    );
    expect(description.instructions).not.toContain(
      "## 5. Category-specific details",
    );
    expect(matching.instructions).toContain("## 8. Matching rubric");
    expect(matching.instructions).not.toContain(
      "## 10. Capsule wardrobe expertise",
    );
    expect(getFashionVersions().promptSourceHash).toBe(
      createHash("sha256").update(core).digest("hex"),
    );
    expect(description.versions.schemaVersion).toBe("fashion-item.v1");
  });
});
