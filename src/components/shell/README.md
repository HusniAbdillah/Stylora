# Workspace shell

Import `WorkspaceShell` from `@/components/shell` to share the desktop sidebar, collapsible tablet rail, mobile top bar and navigation drawer. Pass the active path, workspace name, breadcrumbs, actual activity records and feature content. Supply `draftStatus` only when the caller knows the persisted draft state.

The same module exports `WorkspaceTopBar`, `WorkspaceSidebar`, `MobileTopBar` and `ActivityMenu` for individual composition. Resize the Shell stories in `pnpm storybook` to review the navigation at each breakpoint.
