import { wardrobeImage } from "@/features/wardrobe/server";
import { wardrobeRoute } from "@/features/wardrobe/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const response = await wardrobeRoute(async () => {
    const { itemId } = await params;
    return (await wardrobeImage(itemId)).signedUrl;
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
