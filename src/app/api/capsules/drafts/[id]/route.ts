import { ApiError, apiRoute } from "@/lib/api";
import { saveCapsuleDraft } from "@/features/capsules/drafts";

export function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return apiRoute(async () => {
    if (Number(request.headers.get("content-length") ?? 0) > 20_000)
      throw new ApiError(
        "draft_too_large",
        "The draft is too large to save.",
        413,
      );
    const body = await request.text();
    if (body.length > 20_000)
      throw new ApiError(
        "draft_too_large",
        "The draft is too large to save.",
        413,
      );
    const result = await saveCapsuleDraft(
      (await context.params).id,
      JSON.parse(body),
    );
    if (!result.ok)
      throw new ApiError(
        result.code,
        result.code === "draft_conflict"
          ? "The draft changed in another session. Your local edits are kept."
          : "Your draft could not be saved. Check the selected owned items and retry.",
        result.code === "draft_conflict" ? 409 : 422,
      );
    return { id: result.id, revision: result.revision };
  });
}
