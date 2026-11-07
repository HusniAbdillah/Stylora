import {
  getWardrobeDraft,
  saveWardrobeDraft,
  draftCommand,
} from "@/features/wardrobe/server";
import { wardrobeRoute, readJson } from "@/features/wardrobe/http";
import { revisionSchema } from "@/features/wardrobe/schema";
import { z } from "zod";
type Context = { params: Promise<{ draftId: string }> };
export async function GET(_request: Request, { params }: Context) {
  return wardrobeRoute(async () => getWardrobeDraft((await params).draftId));
}
export async function PATCH(request: Request, { params }: Context) {
  return wardrobeRoute(async () =>
    saveWardrobeDraft((await params).draftId, await readJson(request)),
  );
}
export async function DELETE(request: Request, { params }: Context) {
  return wardrobeRoute(async () => {
    const { expectedRevision } = z
      .strictObject({ expectedRevision: revisionSchema })
      .parse(await readJson(request));
    return (
      await draftCommand((await params).draftId, expectedRevision, "discard")
    ).draft;
  });
}
