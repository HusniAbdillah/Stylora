import { NextResponse } from "next/server";
import { saveCapsuleDraft } from "@/features/capsules/drafts";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (Number(request.headers.get("content-length") ?? 0) > 20_000)
      return new Response(null, { status: 413 });
    const body = await request.text();
    if (body.length > 20_000) return new Response(null, { status: 413 });
    const result = await saveCapsuleDraft(
      (await context.params).id,
      JSON.parse(body),
    );
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.code === "draft_conflict" ? 409 : 422,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: "capsule_draft_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
