# Stylora developer shortcuts. Every target wraps a pnpm script or a Supabase CLI
# command already described in docs/WORKFLOW.md. Run `make help` for the list.
#
# Deliberately absent: any target that resets or wipes the hosted database.
# Recipes avoid shell-specific syntax so they work in Git Bash and in cmd.

PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install env dev build start lint typecheck test check format format-write ci pre-pr db-new db-push db-types

help:
	@echo Stylora make targets
	@echo.
	@echo Setup
	@echo   make install       Install dependencies with the frozen lockfile
	@echo   make env           Create .env.local from .env.example when missing
	@echo Develop
	@echo   make dev           Start the Next.js dev server on port 3000
	@echo   make build         Production build
	@echo   make start         Serve the production build
	@echo Quality
	@echo   make lint          ESLint
	@echo   make typecheck     next typegen and tsc
	@echo   make test          Vitest, single run
	@echo   make check         lint, typecheck and test (same as pnpm check)
	@echo   make format        Prettier check
	@echo   make format-write  Prettier write
	@echo   make ci            Same steps as .github/workflows/check.yml
	@echo   make pre-pr        check then build; run after rebasing on origin/main
	@echo Database, Owner 1 only
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

check:
	$(PNPM) check

format:
	$(PNPM) format:check

format-write:
	$(PNPM) exec prettier --write src scripts package.json tsconfig.json "*.config.*"

ci: install check build

pre-pr: check build

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
