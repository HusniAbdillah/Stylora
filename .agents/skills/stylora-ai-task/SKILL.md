---
name: stylora-ai-task
description: Use when writing or changing any Stylora code that calls an AI model, including garment description, review with confidence, matching explanations, outfit ideas, regeneration, capsules and avatar prompts. Enforces prompt loading, schema validation, versions, honest failure and concurrency.
---

# Build a fashion AI task

An AI task is a pipeline, not a prompt string. Every step below is required.

## 1. Inputs

- Load the full text of `docs/FASHION-PROMPT.md`, only the relevant sections of
  `docs/FASHION.md`, and the matching schema from `docs/FASHION-STRUCTURE.md`.
  The prompt files are bundled into a server artifact under `src/prompts`. If that
  loader does not exist yet, use the contract from Owner 2 and Owner 4. Never paste
  prompt text into a handler or claim a file is used because it exists.
- Record the prompt, knowledge and schema versions with the result.
- Use canonical item attributes (`fashion-item.v1`). Keep user facts, inferred
  observations, catalog facts and corrections separate.
- Skin tone, undertone, body profile and fit preferences are optional user
  selections. Never infer them from the person in an inspiration image. Say a
  preference signal was used only if it was supplied and actually sent.
- Capsule reasoning sends text and item IDs, never inventory photographs.

## 2. Execution

- Persist an operation row (kind, subject, input fingerprint, revision, status,
  result reference) before calling a provider. Same fingerprint returns the
  existing operation. Reject a stale completion whose revision no longer matches.
- Start work automatically only when inputs are complete and stable.
- Run independent calls in parallel with bounded pools: description and
  confidence start together, missing-slot searches use a pool of three, avatar
  images run one at a time per workspace. Collect with settle-all, so one failure
  never hides the others.
- Await the provider inside the request's `maxDuration`. Do not use timers or
  un-awaited promises as background work. Do not call the database row a queue.
- Stream whole schema-valid pieces. Mark partial results provisional until final
  validation. Do not simulate progress.

## 3. Output

- Parse provider output with Zod against the schema. Reject and retry or fail on
  invalid output; never repair it by guessing.
- Never invent wardrobe IDs, product data, ratings, prices or model output.
  Validate every ID against the workspace.
- Apply functional matching gates before scoring. A football jersey is not a
  formal top because color and category look similar.
- Every recommendation carries a concrete Why this reason, evidence, differences
  and uncertainty.
- An unconfigured or failing provider returns a clear unavailable state. Samples
  are explicit, labeled and separate. A mock error is not a successful inference.

## 4. Safety

Log operation kind, IDs, versions and safe error codes only. No keys, signed
URLs, personal payloads or unrestricted provider output. Save success and image
generation success are separate states.

## 5. Evidence

Record in `docs/PROGRESS-NEW.md` whether data is real provider output, a fixture
or a sample, the model used, and what was not run. Provider calls count against
the developer budget in `docs/WORKFLOW.md` section 1.
