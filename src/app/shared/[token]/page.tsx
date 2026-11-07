import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/http";
import { readPublicShare } from "@/features/sharing/server";
import { PublicShare } from "@/features/sharing/share-views";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  title: "Shared look | Stylora",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function SharedLookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  let shared: Awaited<ReturnType<typeof readPublicShare>>;
  try {
    shared = await readPublicShare((await params).token);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <PublicShare
      look={{
        title: shared.title,
        catchphrase: shared.catchphrase,
        avatarUrl: shared.media[0]?.url ?? null,
        avatarNotice:
          shared.mediaStatus === "not_included"
            ? "No avatar was included in this shared look."
            : "The shared avatar is unavailable.",
        items: shared.items.map((item, index) => ({
          id: String(index),
          name: item.name,
          imageUrl: item.imageUrl,
        })),
        expiresLabel: new Intl.DateTimeFormat("en", {
          dateStyle: "long",
          timeZone: "Asia/Jakarta",
        }).format(new Date(shared.expiresAt)),
      }}
    />
  );
}
