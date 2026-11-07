---
name: stylora-feature-slice
description: Use when adding or changing a Stylora route, server query, mutation, schema or component. Gives the vertical-slice layout, workspace scoping pattern, Zod validation, write gate and state handling so server code is correct the first time.
---

# Build a vertical slice

One owner delivers one working route end to end. No global controller, service or
repository layer. No new dependency, ORM, state library or queue.

## Layout

```
src/app/<route>/page.tsx        thin: parse params, call feature query, render
src/app/<route>/loading.tsx     tailored skeleton, shown immediately on navigation
src/features/<slice>/           schema.ts, queries.ts, actions.ts, components
```

Start flat. Add `components/` or `queries/` only when the folder gets crowded.
The import alias is `@/`. Dependency direction: `app` to `feature` to `lib`. A
cross-feature call uses a function the owning slice exports.

## Server rules

- Server Components by default. Client components only for browser interaction
  (file pick, drafts, stepper, selection). Never move a secret into one.
- Mark any module that reads privileged data with `import "server-only";`.
- All Supabase access goes through `getWorkspaceDatabase()` from
  `@/lib/supabase/server`. It returns `{ client, workspaceId, writesEnabled }`.
- Scope every read, write, RPC and child lookup by that `workspaceId`. Never
  accept a workspace ID from the client. Check parent membership for child rows.
- Validate request bodies, action input, query params and provider output with
  Zod first, then apply domain checks.
- Convert snake case to camel case once, at the persistence boundary.
- Never log secrets, signed URLs, personal payloads or raw provider output. Throw
  or return safe error codes only.

## Query pattern

```ts
import "server-only";
import { getWorkspaceDatabase } from "@/lib/supabase/server";

export async function listOwnedItems() {
  const { client, workspaceId } = getWorkspaceDatabase();
  const { data, error } = await client
    .from("wardrobe_items") // check src/types/database.ts for real names
    .select("id, name, category")
    .eq("workspace_id", workspaceId)
    .eq("inventory_status", "owned");
  if (error) throw new Error("wardrobe_items_read_failed");
  return data.map(toItem);
}
```

Owned-only means `inventory_status = owned`. Marketplace candidates never enter
matching or capsules until the user marks them owned.

## Mutation pattern

Check `writesEnabled` first and return a typed result, not a thrown string:
`{ ok: false, code: "writes_disabled" }`. Parse input with Zod. Make retries
idempotent (fingerprint or natural key). Use revisions for edits and return a
conflict result on a stale revision, keeping the user's draft.

## State and UX contract

Every screen has loading (tailored skeleton), empty, partial, error and retry
states. Drafts, selections, filters and results survive navigation. Do not show a
warning that normal navigation loses progress; confirm only real discards and
destructive actions with the shared ConfirmDialog.

## Storage

Buckets stay private. Browser uploads use a server-issued signed URL. Enforce MIME
and byte limits, verify bytes, use random scoped paths, store paths and asset IDs,
never permanent signed URLs. Restrict remote image sources and redirects.

## One test, only if it pays

Write a test only for scoping, Zod contracts, matching gates, idempotency, stale
rejection, URL or MIME limits, or score math. Skip UI and mock-provider tests.
