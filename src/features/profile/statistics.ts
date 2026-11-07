import "server-only";
import { getWorkspaceDatabase } from "@/lib/supabase/server";

export async function getProfileStatistics() {
  const { client, workspaceId } = getWorkspaceDatabase();
  const totals = await Promise.allSettled([
    client
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("inventory_status", "owned")
      .is("archived_at", null),
    client
      .from("saved_look_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    client
      .from("capsules")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    client
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  const count = (index: number) => {
    const result = totals[index];
    return result.status === "fulfilled" && !result.value.error
      ? result.value.count
      : null;
  };
  return {
    wardrobeItems: count(0),
    savedLooks: count(1),
    capsules: count(2),
    activeShares: count(3),
  };
}
