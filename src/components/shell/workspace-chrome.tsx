"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type WorkspaceCrumb = { label: string; href?: string };
export type WorkspaceChrome = {
  breadcrumbs?: readonly WorkspaceCrumb[];
  draftStatus?: "saving" | "saved" | "failed";
};

const ChromeValue = createContext<WorkspaceChrome>({});
const ChromeSetter = createContext<Dispatch<
  SetStateAction<WorkspaceChrome>
> | null>(null);

/**
 * Holds page-specific breadcrumbs and draft feedback for the one persistent
 * workspace shell, so a page can describe itself without remounting the shell.
 */
export function WorkspaceChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<WorkspaceChrome>({});
  return (
    <ChromeSetter.Provider value={setChrome}>
      <ChromeValue.Provider value={chrome}>{children}</ChromeValue.Provider>
    </ChromeSetter.Provider>
  );
}

export function useWorkspaceChromeValue() {
  return useContext(ChromeValue);
}

/** Registers breadcrumbs or draft status for the current page and clears them on leave. */
export function useWorkspaceChrome(chrome: WorkspaceChrome) {
  const setChrome = useContext(ChromeSetter);
  const key = JSON.stringify(chrome);
  useEffect(() => {
    if (!setChrome) return;
    setChrome(JSON.parse(key) as WorkspaceChrome);
    return () => setChrome({});
  }, [setChrome, key]);
}
