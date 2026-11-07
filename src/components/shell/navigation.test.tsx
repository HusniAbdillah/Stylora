import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceSidebar, workspaceLinks } from "./workspace-navigation";

describe("workspace navigation destinations", () => {
  it("links every published destination from shells without an availability override", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSidebar, {
        activeHref: "/preview",
        displayName: "Workspace profile",
      }),
    );
    for (const { href } of workspaceLinks) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).toMatch(
      /<a(?=[^>]*href="\/")(?=[^>]*aria-label="Stylora home")[^>]*>/,
    );
  });

  it("keeps Create active on outfit detail routes", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceSidebar, {
        activeHref: "/looks/47ef6e8d-c782-4cb3-8e58-ec9967169d82",
        displayName: "Workspace profile",
      }),
    );
    expect(html).toMatch(
      /<a(?=[^>]*href="\/create")(?=[^>]*aria-current="page")[^>]*>/,
    );
  });
});
