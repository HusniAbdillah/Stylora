# Workspace shell

Import `WorkspaceShell` from `@/components/shell` to share the desktop sidebar, collapsible tablet rail, mobile top bar and navigation drawer. Pass the active path, workspace name, breadcrumbs, actual activity records and feature content. Supply `draftStatus` only when the caller knows the persisted draft state.

The same module exports `WorkspaceTopBar`, `WorkspaceSidebar`, `MobileTopBar` and `ActivityMenu` for individual composition. Resize the Shell stories in `pnpm storybook` to review the navigation at each breakpoint.

## One persistent shell

Every signed-in route lives under `src/app/(workspace)`, whose layout mounts `LiveWorkspace` once. Pages in that group must not render `WorkspaceShell`, or the sidebar, activity polling and draft providers would remount on every navigation. A page that needs its own breadcrumbs or draft feedback calls `useWorkspaceChrome({ breadcrumbs, draftStatus })` from a client component. The hook clears itself when the page unmounts. `loading.tsx` and `error.tsx` files render content only.
