---
name: stylora-parallel
description: Use when several Stylora agents or sessions work at the same time, or when one owner wants two tasks in parallel. Defines worktrees, file ownership, contract-first order and what to do when blocked, so parallel work does not collide.
---

# Work in parallel without collisions

The unit of parallelism is the owner's own session. Four owners run four sessions
at once. An owner may start a second session on a disjoint folder in its own
worktree. An agent does not spawn sub-agents unless the owner asks.

## Rules

1. One task, one branch, one worktree: `make wt name=oN/<slug>`. This creates
   `../Stylora-oN-<slug>` from a fresh `origin/main`. Run
   `pnpm install --frozen-lockfile` there. Remove it after merge with
   `make wt-rm name=oN/<slug>`.
2. Stay inside your owner's folders (`docs/TASK.md` section 1). Never edit another
   owner's folder or a Lane B file to unblock yourself. Write the contract-change
   note instead and take the next task.
3. Contract first. Shared schemas and the database contract land through Owner 1's
   contracts pull request by 00:40. Until then code against Zod types and keep one
   persistence function per feature so the swap is one line.
4. Hot files (one owner only): `src/app/globals.css`, `src/app/layout.tsx`, shell
   and UI primitives, `package.json`, lockfile, `.env.example`, `supabase/**`,
   `src/types/database.ts`. Parallel edits there are the main source of conflicts.
5. Keep branches short, up to 90 minutes, and pull requests near 400 lines. Merge
   early. Rebase on `origin/main` only when needed.
6. Never `git stash` across worktrees, never check out another owner's branch in
   your worktree, never rewrite a pushed branch someone else uses.

## Choosing what to run at once

Work that can run at the same time:

- Different features in different owners' folders.
- UI shell against a stubbed query, and the query itself, when the Zod contract is
  agreed.
- One AI handler, its prompt assembly and its skeleton screen.
- Documentation and progress rows next to any code task.

Work that must run in order:

1. Contracts and the baseline migration (Owner 1) before any consumer relies on
   generated types.
2. The operation runner (Owners 2 and 4) before features that start background
   work on a real provider.
3. Owner 1 wardrobe candidate status before Owner 3 import and Owner 2 matching.
4. Owner 2 committed options before Owner 3 prefetch.

## When blocked

Do not wait and do not stub around the owner. Build the part that does not depend
on the blocker (states, skeletons, schema, tests for pure logic), note the
dependency in the pull request, and move to your next unblocked TODO.

## Conflict etiquette

If a rebase conflicts in a file you do not own, stop and report. If it conflicts in
your own file, resolve it, keep the other side's intent, and rerun `make fast`.
