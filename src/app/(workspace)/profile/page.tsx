import type { Metadata } from "next";
import { ProfilePage } from "@/features/profile";

export const metadata: Metadata = { title: "Workspace profile · Stylora" };

export default function Page() {
  return <ProfilePage />;
}
