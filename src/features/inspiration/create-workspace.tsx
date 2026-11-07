"use client";

import { createContext, useContext, type ReactNode } from "react";

const WorkspaceContext = createContext({
  scopeKey: "0000000000000000",
  writesEnabled: false,
});

export function CreateWorkspaceProvider({
  scopeKey,
  writesEnabled,
  children,
}: {
  scopeKey: string;
  writesEnabled: boolean;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={{ scopeKey, writesEnabled }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useCreateWorkspace() {
  return useContext(WorkspaceContext);
}
