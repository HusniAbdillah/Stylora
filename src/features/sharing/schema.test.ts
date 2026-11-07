import { describe, expect, it } from "vitest";
import { createShareSchema, projectPublicSnapshot, publicSnapshotSchema } from "./schema";

describe("public share contracts", () => {
  it("projects only reviewed display fields from the immutable saved items", () => {
    const snapshot = projectPublicSnapshot("Evening look", [{
      name: "Ivory shirt", category: "top", attributes: { colors: ["ivory"], fit: "relaxed" },
      id: "private-item-id", notes: "private note", asset_id: null, image_url: "https://private.example/image",
      provenance: { body_profile: "private" },
    }], "A quiet palette");
    expect(snapshot).toEqual({ title: "Evening look", catchphrase: "A quiet palette", items: [{ name: "Ivory shirt", category: "top", colors: ["ivory"] }] });
    expect(publicSnapshotSchema.safeParse({ ...snapshot, preferences: {} }).success).toBe(false);
  });

  it("bounds expiry and rejects client-supplied public snapshots or workspace IDs", () => {
    for (const expiresInHours of [0, 721, 1.5]) expect(createShareSchema.safeParse({ expiresInHours }).success).toBe(false);
    expect(createShareSchema.parse({ expiresInHours: 720, approvedMediaIds: [] }).expiresInHours).toBe(720);
    expect(createShareSchema.safeParse({ publicSnapshot: {}, workspaceId: "foreign" }).success).toBe(false);
  });
});
