---
name: stylora-start-task
description: Use at the start of any Stylora task, before writing code. Finds the task ID, owner, lane and the few spec sections to read, sets up an isolated branch or worktree, and states a short plan. Prevents reading every document and prevents starting blocked work.
---

# Start a Stylora task

Goal: be productive in under five minutes without reading the whole spec set.
`AGENTS.md` is already loaded; do not re-read it.

## 1. Identify

- Task ID and owner from `docs/TASK.md` sections 3 to 6 (for example `O2.4`) and
  the matching line in `docs/TODO.md` or `docs/WORKFLOW.md` section 7.
- Figma frame IDs from `docs/WORKFLOW.md` section 4 (Dxx desktop, Mxx mobile).
- Lane from `docs/WORKFLOW.md` section 10.6. If any file you must touch is a Lane
  B path, plan for a pull request that stops for human approval.

## 2. Read only what the task needs

Use search, not full reads. `docs/FASHION.md` is long; never read it end to end.

| Task area                               | Read these sections                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Any feature                             | Your PRD requirement IDs (`grep -n "R2[0-9]" docs/PRD.md`), your TDD route section |
| Item data, wardrobe, matching, capsules | `docs/FASHION-STRUCTURE.md` (schema), `docs/FASHION-PROMPT.md` (prompt)            |
| Any AI call                             | The `stylora-ai-task` skill, plus the one `docs/FASHION.md` section for the task   |
| Database, queries, saves, sharing       | `docs/TDD.md` data model, `docs/DATABASE.md` (Owner 3), `docs/ARCHITECTURE.md`     |
| Screens                                 | Your Figma frames and `docs/DESIGN.md` tokens and component rows                   |
| Background work, operations             | `docs/WORKFLOW.md` section 5 and `docs/TDD.md` section 8                           |

Find a section with `grep -n "^#" docs/TDD.md`, then read only that range.

## 3. Check blockers before coding

- Is the contract you consume merged (`src/types/database.ts`, Zod schema, another
  owner's exported function)? If not, code against the Zod contract and keep the
  persistence call behind one function, as `docs/WORKFLOW.md` section 2 says. Do
  not invent a parallel schema.
- If you need another owner's file, write the contract-change note from
  `docs/TASK.md` section 8 instead of editing it.
- If the task is blocked, take the next unblocked item in your TODO. Do not wait.

## 4. Isolate

- `git fetch origin`, `git status`. Note unrelated local changes and leave them.
- One branch or worktree per task: `make wt name=oN/<slug>` (see
  `stylora-parallel`). Run `pnpm install --frozen-lockfile` once in a new worktree.

## 5. State a plan in five lines, then build

Files to touch, contract used, states to cover (loading, empty, partial, error,
retry), the one test worth writing if any, and the lane. Then proceed without
asking, unless a scope question would change product behavior.

Build with `stylora-feature-slice`, `stylora-ai-task` and `stylora-ui-from-figma`.
Run `stylora-antislop` before the pull request. Deliver with `stylora-ship`.
