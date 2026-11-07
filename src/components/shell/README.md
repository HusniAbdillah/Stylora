# Workspace shell

Workspace routes live under `src/app/(workspace)` and inherit one persistent
`LiveWorkspace` from its layout. Pages, loading states and error boundaries
render content only; do not add another `WorkspaceShell` or `LiveWorkspace`.
This keeps navigation, profile, activity and Create recovery mounted between
destinations. Public landing and share routes stay outside the workspace group.

`WorkspaceShell` composes the desktop sidebar, collapsible tablet rail, mobile
top bar and navigation drawer. Supply `draftStatus` only when the caller knows
the persisted draft state. Navigation links prefetch on pointer hover and keyboard
focus, and show pending feedback while the destination loads.

The same module exports `WorkspaceTopBar`, `WorkspaceSidebar`, `MobileTopBar` and `ActivityMenu` for individual composition. Resize the Shell stories in `pnpm storybook` to review the navigation at each breakpoint.
