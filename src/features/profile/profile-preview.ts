"use client";

import { z } from "zod";
import { createPreviewStore } from "@/lib/preview/store";

const profileStateSchema = z.strictObject({
  draftName: z.string().max(80),
  displayName: z.string().min(1).max(80),
});

export type ProfileState = z.infer<typeof profileStateSchema>;

export const profilePreviewStore = createPreviewStore<ProfileState>(
  "profile",
  { draftName: "Studio guest", displayName: "Studio guest" },
  (value) => profileStateSchema.safeParse(value).success,
);

export function useWorkspaceName(): string {
  return profilePreviewStore.useValue().displayName;
}
