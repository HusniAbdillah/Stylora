import { wardrobePageState } from "@/features/wardrobe/server";
import type { Metadata } from "next";
import { WardrobeCollectionScreen } from "@/features/wardrobe/wardrobe-collection-screen";

export const metadata: Metadata = { title: "Wardrobe · Stylora" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WardrobePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["category", "status", "q", "add"]) {
    const value = params[key];
    if (typeof value === "string") query.set(key, value);
  }

  const state = await wardrobePageState();
  return (
    <WardrobeCollectionScreen
      initialSearch={query.toString()}
      initialItems={state.items}
      initialError={state.error}
      writesEnabled={state.writesEnabled}
    />
  );
}
