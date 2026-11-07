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
    const core = readFileSync(
      join("docs", "FASHION-PROMPT.md"),
      "utf8",
    ).replace(/\r\n/g, "\n");
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

  it("assembles Capsule and image directions with their own knowledge", () => {
    const capsule = buildFashionPrompt("capsule_generation");
    const image = buildFashionPrompt("preview_image");
    expect(capsule.instructions).toContain("## 10. Capsule wardrobe expertise");
    expect(capsule.instructions).toContain("## 8. Common explanation envelope");
    expect(image.instructions).toContain(
      "## 12. Avatar and visual preview direction",
    );
    expect(image.instructions).toContain(
      "Create the requested illustrative image",
    );
    expect(image.instructions).not.toContain(
      "Return only the supplied strict JSON schema",
    );
    expect(image.instructions.length).toBeLessThan(26000);
  });
});
