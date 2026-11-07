import type { Metadata } from "next";
import { PreferencesPage } from "@/features/preferences";

export const metadata: Metadata = { title: "Preferences · Stylora" };

export default function Page() {
  return <PreferencesPage />;
}
