import { describe, expect, it } from "vitest";
import {
  createShareSchema,
  initialLookDescription,
  isShareActive,
  projectPublicSnapshot,
  publicSnapshotSchema,
} from "./schema";

describe("public share contracts", () => {
  it("projects only reviewed display fields from the immutable saved items", () => {
    const snapshot = projectPublicSnapshot(
      "Evening look",
      [
        {
          name: "Ivory shirt",
          category: "top",
          attributes: { colors: ["ivory"], fit: "relaxed" },
          id: "private-item-id",
          notes: "private note",
          asset_id: null,
          image_url: "https://private.example/image",
          provenance: { body_profile: "private" },
        },
      ],
      "A quiet palette",
    );
    expect(snapshot).toEqual({
      title: "Evening look",
      catchphrase: "A quiet palette",
      items: [{ name: "Ivory shirt", category: "top", colors: ["ivory"] }],
    });
    expect(
      publicSnapshotSchema.safeParse({ ...snapshot, preferences: {} }).success,
    ).toBe(false);
  });

  it("accepts new requests without expiry and validates legacy expiry input", () => {
    expect(createShareSchema.parse({}).expiresInHours).toBeUndefined();
    for (const expiresInHours of [0, 721, 1.5])
      expect(createShareSchema.safeParse({ expiresInHours }).success).toBe(
        false,
      );
    expect(
      createShareSchema.parse({ expiresInHours: 720, approvedMediaIds: [] })
        .expiresInHours,
    ).toBe(720);
    expect(
      createShareSchema.safeParse({
        publicSnapshot: {},
        workspaceId: "foreign",
      }).success,
    ).toBe(false);
  });

  it("keeps permanent links active while respecting revocation and legacy expiry", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    expect(isShareActive(null, null, now)).toBe(true);
    expect(isShareActive(null, "2026-11-07T11:00:00Z", now)).toBe(false);
    expect(isShareActive("2026-11-07T13:00:00Z", null, now)).toBe(true);
    expect(isShareActive("2026-11-07T12:00:00Z", null, now)).toBe(false);
    expect(isShareActive("invalid", null, now)).toBe(false);
  });

  it("prefills a reviewed description or saved item names only", () => {
    const items = [
      { name: "Ivory shirt", notes: "private note" },
      { name: "Charcoal trousers", rationale: "private preference" },
    ];
    expect(initialLookDescription(items, " Existing public description ")).toBe(
      "Existing public description",
    );
    expect(initialLookDescription(items)).toBe(
      "Ivory shirt, Charcoal trousers",
    );
    expect(
      initialLookDescription(Array.from({ length: 20 }, () => items[0])).length,
    ).toBeLessThanOrEqual(240);
  });
});
