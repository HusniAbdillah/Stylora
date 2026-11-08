import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavedLookDetail, type SavedLook } from "./saved-looks";

const look: SavedLook = {
  id: "fixture-look",
  title: "Saved outfit",
  savedAt: "Today",
  items: [],
  mediaStatus: "failed",
  canRetry: false,
};
describe("saved image recovery actions", () => {
  it("provides a fresh request when a failed image cannot be retried", () => {
    const html = renderToStaticMarkup(
      <SavedLookDetail look={look} onRegenerateImage={() => {}} />,
    );
    expect(html).toContain("Generate new image");
    expect(html).not.toContain("Retry image");
  });
  it("keeps retryable failures on their existing retry action", () => {
    const html = renderToStaticMarkup(
      <SavedLookDetail
        look={{ ...look, canRetry: true }}
        onRetryImage={() => {}}
        onRegenerateImage={() => {}}
      />,
    );
    expect(html).toContain("Retry image");
    expect(html).not.toContain("Generate new image");
  });
  it("disables fresh generation for read-only views", () => {
    const html = renderToStaticMarkup(
      <SavedLookDetail
        look={look}
        writesEnabled={false}
        onRegenerateImage={() => {}}
      />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>Generate new image<\/button>/,
    );
  });
});
