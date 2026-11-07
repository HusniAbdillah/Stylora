import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";
import { InstallAppProvider } from "@/components/pwa/install-app";
import "./globals.css";
import { NotificationCenter } from "@/components/ui/notification-center";

export const metadata: Metadata = {
  applicationName: "Stylora",
  title: "Stylora",
  description:
    "A fashion studio for turning outfit inspiration into everyday decisions.",
  appleWebApp: { capable: true, title: "Stylora", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/favicon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F2EC",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InstallAppProvider>
          {children}
          <RegisterServiceWorker />
          <NotificationCenter />
        </InstallAppProvider>
      </body>
    </html>
  );
}
