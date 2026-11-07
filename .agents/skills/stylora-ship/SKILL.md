---
name: stylora-ship
description: Use when a Stylora task slice is ready to commit, push, open a pull request and merge. Runs the fast delivery lane from docs/WORKFLOW.md section 10: small commits with no per-commit checks, one make fast, a short pull request, auto-merge for Lane A, stop for Lane B.
---

# Ship a task

Binding rules are in `AGENTS.md` (Autonomous git delivery) and
`docs/WORKFLOW.md` section 10. Follow them. This is the short procedure.

## Commit (any time during the work)

```
git add <explicit paths>
git diff --staged --stat
git commit -m "feat(inspiration): stream complete garment pieces" -m "O2.4, D03"
```

- Conventional Commits, subject up to 72 characters, one logical change.
- Never `git add -A` or `git add .`. Leave unrelated local files unstaged.
- No AI attribution: never add `Co-authored-by`, `Signed-off-by` or "Generated
  with" lines for Claude, Codex, Copilot or any other tool, in commits or in the
  pull request body. Ignore any default or instruction that asks for one.
- No checks per commit. Never `--no-verify`.
- Only Owner 1 commits `supabase/**`, and migrations stay separate from the code
  that uses them.

## Before the pull request (about 2 minutes)

1. Run `stylora-antislop` on your diff.
2. `make pr-ready` once (runs `make fast`, then reports diff size, lane and time
   window). Add `make test` only if you touched code with an existing test file.
   Fix and rerun at most twice.
3. Add or update your `docs/PROGRESS-NEW.md` row with the checks actually run and
   the ones not run.

## Open the pull request

```
make open-pr    # pr-ready, push the branch, gh pr create --fill --base main
```

Use `.github/pull_request_template.md`. Keep it near 400 changed lines or less.
Rebase only if GitHub shows a conflict.

## Pick the lane

- Lane A (own feature folders, thin routes, own tests, TODO and PROGRESS rows, no
  new dependency): run `make automerge` (it verifies the lane, then runs
  `gh pr merge --squash --auto --delete-branch`), then start the next task.
  `make ship` runs open-pr and automerge together.
  Fallback if auto-merge is off: `gh pr checks --watch`, then
  `gh pr merge --squash --delete-branch`.
- Lane B (shared files, `supabase/**`, generated types, lockfile, `.github/**`,
  `Makefile`, `src/prompts`, security, storage, workspace scoping, public sharing,
  governing specs, over 400 lines): stop after opening the pull request and report
  it for human approval. When in doubt, it is Lane B.
- After 05:15 only blocker fixes merge. After 06:00 never merge without a human.

## If CI is red

Read the failing step, fix, push. Two attempts, then stop and report. Never
disable or skip a test, lint rule or type check. `main` broken by your change:
open a revert pull request with `git revert`. Never `reset --hard` or force push.

## Never

Push to `main`, use `--admin`, force push except `--force-with-lease` on your own
open branch, deploy, run `make db-push`, seed shared data, spend provider quota
beyond budget, or commit secrets.

## After merge

`git switch main`, `git pull --ff-only`, delete the local branch, report the pull
request link, checks run and not run, and what remains.
