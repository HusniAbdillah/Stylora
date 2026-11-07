"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function subscribe(listener: () => void) {
  const display = window.matchMedia("(display-mode: standalone)");
  display.addEventListener("change", listener);
  window.addEventListener("appinstalled", listener);
  return () => {
    display.removeEventListener("change", listener);
    window.removeEventListener("appinstalled", listener);
  };
}

function platform() {
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  )
    return "installed";
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    ? "ios"
    : "browser";
}

const InstallContext = createContext<{
  mode: string;
  available: boolean;
  busy: boolean;
  error: boolean;
  install: () => Promise<void>;
} | null>(null);

export function InstallAppProvider({ children }: { children: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, platform, () => "browser");
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    function available(event: Event) {
      if (!("prompt" in event) || !("userChoice" in event)) return;
      event.preventDefault();
      setPrompt(event as InstallPrompt);
      setError(false);
    }
    function installed() {
      setPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    setError(false);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setError(true);
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  }

  return (
    <InstallContext value={{ mode, available: !!prompt, busy, error, install }}>
      {children}
    </InstallContext>
  );
}

export function InstallApp() {
  const context = useContext(InstallContext);
  if (!context) return null;
  const { mode, available, busy, error, install } = context;
  if (mode === "installed" || (!available && mode !== "ios" && !error))
    return null;
  return (
    <aside
      aria-label="Install Stylora"
      className="py-6 text-control text-muted"
    >
      {available && (
        <Button
          variant="secondary"
          onClick={install}
          disabled={busy}
          aria-busy={busy}
        >
          Install Stylora
        </Button>
      )}
      {error && (
        <p role="status">
          Installation could not start. Try your browser’s install menu.
        </p>
      )}
      {mode === "ios" && !available && (
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center underline">
            Add Stylora to your home screen
          </summary>
          <p className="mt-2 max-w-prose">
            In Safari, open the Share menu and choose Add to Home Screen. If
            shown, keep Open as Web App enabled, then tap Add. An internet
            connection is needed for your wardrobe and outfit generation.
          </p>
        </details>
      )}
    </aside>
  );
}
