import { apiResponse, readJson } from "@/lib/http";
import { createShare, listShares } from "@/features/sharing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return apiResponse(async () => createShare((await context.params).id, await readJson(request)));
}

export async function GET(request: Request, context: Context) {
  return apiResponse(async () => listShares((await context.params).id, Object.fromEntries(new URL(request.url).searchParams)));
}
