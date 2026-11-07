import { createWorkspaceSignedRead } from "@/lib/supabase/storage";
import {
  getWardrobeDraft,
  wardrobeDatabaseError,
} from "@/features/wardrobe/server";
import { wardrobeRoute } from "@/features/wardrobe/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const response = await wardrobeRoute(async () => {
    const draft = await getWardrobeDraft((await params).draftId);
    if (!draft.assetId || draft.status === "discarded")
      wardrobeDatabaseError({ code: "P0002" });
    return (await createWorkspaceSignedRead(draft.assetId)).signedUrl;
  });
  if (!response.ok) return response;
  const { data } = await response.json();
  return new Response(null, {
    status: 302,
    headers: {
      Location: data,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
