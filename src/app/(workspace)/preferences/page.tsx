import type { Metadata } from "next";
import { PreferencesPage } from "@/features/preferences";

export const metadata: Metadata = { title: "Preferences · Stylora" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  return (
    <PreferencesPage
      returnTo={typeof returnTo === "string" ? returnTo : undefined}
    />
  );
}
