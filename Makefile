# Stylora developer shortcuts. Every target wraps a pnpm script or a Supabase CLI
# command already described in docs/WORKFLOW.md. Run `make help` for the list.
#
# Deliberately absent: any target that resets or wipes the hosted database.
# Recipes avoid shell-specific syntax so they work in Git Bash and in cmd.

PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install env dev build start lint typecheck test fast check format format-write ci pre-pr pr-check pr-ready open-pr automerge ship wt wt-rm db-new db-push db-types

help:
	@echo Stylora make targets
	@echo -
	@echo [Setup]
	@echo   make install       Install dependencies with the frozen lockfile
	@echo   make env           Create .env.local from .env.example when missing
	@echo [Develop]
	@echo   make dev           Start the Next.js dev server on port 3000
	@echo   make build         Production build
	@echo   make start         Serve the production build
	@echo [Quality]
	@echo   make lint          ESLint
	@echo   make typecheck     next typegen and tsc
	@echo   make test          Vitest, single run
	@echo   make fast          lint and typecheck, run once before a pull request
	@echo   make check         lint, typecheck and test, same as pnpm check
	@echo   make format        Prettier check
	@echo   make format-write  Prettier write
	@echo   make ci            Same steps as .github/workflows/check.yml
	@echo   make pre-pr        check then build, run after rebasing on origin/main
	@echo [Delivery lane]
	@echo   make pr-check      Diff size, lane and time window, read only
	@echo   make pr-ready      make fast, then pr-check
	@echo   make open-pr       pr-ready, push the branch, open the pull request
	@echo   make automerge     Lane A only: enable auto-merge after CI
	@echo   make ship          open-pr then automerge, stops for Lane B
	@echo [Parallel work]
	@echo   make wt name=o2/review-stream     New worktree and branch from origin/main
	@echo   make wt-rm name=o2/review-stream  Remove that worktree after merge
	@echo [Database, Owner 1 only]
	@echo   make db-new name=add_operations   Create a new migration with the CLI
	@echo   make db-types                     Regenerate src/types/database.ts
	@echo   make db-push CONFIRM=yes          Push reviewed migrations to hosted Supabase

install:
	$(PNPM) install --frozen-lockfile

env:
	@node -e "const fs=require('fs');if(fs.existsSync('.env.local')){console.log('.env.local already exists')}else{fs.copyFileSync('.env.example','.env.local');console.log('Created .env.local. Fill in your own workspace values.')}"

dev:
	$(PNPM) dev

build:
	$(PNPM) build

start:
	$(PNPM) start

lint:
	$(PNPM) lint

typecheck:
	$(PNPM) typecheck

test:
	$(PNPM) test

# Fast gate, run once before opening a pull request: lint and typecheck, no tests.
fast: lint typecheck

check:
	$(PNPM) check

format:
	$(PNPM) format:check

format-write:
	$(PNPM) exec prettier --write src scripts package.json tsconfig.json "*.config.*"

ci: install check build

pre-pr: check build

# Delivery lane, docs/WORKFLOW.md section 10. None of these push to main, bypass
# protection or touch the database. Set STYLORA_T0 (ISO time of the build start)
# to enforce the 05:15 and 06:00 merge limits.
#   pr-check   diff size, Lane A or B and time window, read only
#   pr-ready   make fast, then pr-check
#   open-pr    pr-ready, push the branch, open the pull request
#   automerge  Lane A only: enable auto-merge, GitHub merges when CI is green
#   ship       open-pr then automerge; stops after opening for Lane B
pr-check:
	node scripts/pr-check.mjs

pr-ready: fast pr-check

open-pr: pr-ready
	git push -u origin HEAD
	gh pr create --fill --base main

automerge:
	node scripts/pr-check.mjs --require-lane-a
	gh pr merge --squash --auto --delete-branch

ship: open-pr automerge

# One worktree per task so parallel sessions never share a working tree. The
# folder is created next to the repo, for example ../Stylora-o2-review-stream.
# Run pnpm install --frozen-lockfile once inside it.
wt:
ifndef name
	$(error Usage: make wt name=oN/short-slug)
endif
	git fetch origin
	git worktree add ../Stylora-$(subst /,-,$(name)) -b $(name) origin/main

# Only after the branch is merged. Refuses to remove a worktree with local changes.
wt-rm:
ifndef name
	$(error Usage: make wt-rm name=oN/short-slug)
endif
	git worktree remove ../Stylora-$(subst /,-,$(name))

# Owner 1 only. Never edit an applied migration; add a new one instead.
db-new:
ifndef name
	$(error Usage: make db-new name=short_snake_case_description)
endif
	$(PNPM) exec supabase migration new $(name)

db-types:
	$(PNPM) db:types

# Changes the shared hosted database, so it needs an explicit confirmation and
# a reviewed, merged migration. Requires SUPABASE_PROJECT_ID, SUPABASE_ACCESS_TOKEN
# and SUPABASE_DB_PASSWORD exported in the shell.
db-push:
ifneq ($(CONFIRM),yes)
	$(error db-push changes the hosted database. Re-run with CONFIRM=yes after the migration PR is reviewed)
endif
	$(PNPM) exec supabase db push
