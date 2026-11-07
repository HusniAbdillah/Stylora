# Wardrobe

Owns image-first item intake, canonical item persistence and inventory state. Publish one active owned-inventory query for consumers.


## Backend contract

All access is server-only and uses the configured workspace. Preferences and Profile remain Owner 2's scope.

- `listWardrobeItems` reads canonical `fashion-item.v1` items with category, inventory status, archive and text filters. `listActiveOwnedWardrobe` exports owned, non-archived items for other features, including sample-origin owned starter items.
- Item GET and PATCH use real UUIDs and optimistic `expectedRevision`. Actions are `edit`, `archive`, `restore`, `mark_owned` and `replace_photo`. Edits preserve original inference and record user corrections; `clearCorrections` restores original readings.
- POST `/api/wardrobe/drafts` creates an intake draft, or an edit draft with `itemId`. Draft IDs in browser storage are resume pointers; inventory and draft values live in Supabase.
- POST `/api/wardrobe/uploads` allocates a private signed upload and persists its pending asset identity. Verify with `/drafts/[draftId]/verify` after PUT. Verification checks declared size and MIME, decoded format, pixel limits and scoped parent membership. Only verified bytes are promoted to ready and attached atomically.
- POST `/drafts/[draftId]/analyze` persists or reuses a `wardrobe_description` operation. POST `/operations/[operationId]/run` awaits the existing shared provider inside the request and streams complete provisional garments as NDJSON. GET on the analyze endpoint restores operation status. Final draft publication checks attempt, fingerprint, active lease, asset and draft revision.
- Extraction uses Owner 2's `requestFashion`, `descriptionSchema` and `buildFashionPrompt("inspiration_description")`, the same physical-garment reading task. Prompt, knowledge, schema, source hashes, assembly hash, model and usage are recorded. No separate Wardrobe model or invented fallback output is used. Provider errors leave the saved photo available for retry or manual entry.
- Confirm one proposal with `/drafts/[draftId]/confirm`. The transaction attaches its verified asset, creates an owned row and records the saved proposal. Repeating confirmation returns the original item ID. Multiple garments share the original photograph; no segmented images are fabricated.
- Private media endpoints check the item or Wardrobe draft before issuing a short-lived signed redirect. Responses use `no-store`; signed URLs are never persisted.

## Verification and repair

The two Wardrobe migrations are additive. Business conflicts use SQLSTATE `PT409`: PostgREST 14 can retry `40001` indefinitely, so serialization errors are unsuitable for deterministic revision checks.

Run the focused canonical tests with `pnpm test src/features/wardrobe/schema.test.ts`. Hosted tests are skipped unless `RUN_WARDROBE_ONLINE=1`; supply an env file with `WARDROBE_SMOKE_ENV_FILE`, explicitly select writable `dev-owner-1`, then run `pnpm test src/features/wardrobe/server.online.test.ts`. The suite uses real signed Storage and cleans up its disposable write fixture.

`supabase/tests/wardrobe.sql` checks grants, RLS, foreign workspace rejection, idempotency, revision conflicts and stale completion inside a rolled-back synthetic transaction. It does not call a provider.

`scripts/test-wardrobe-http.mjs --with-ai` requires a loopback `STYLORA_TEST_BASE_URL` and writable `dev-owner-1`. It spends provider quota on one real dataset garment, checks streamed and confirmed output, and removes its temporary item, draft and image. The paid operation and events remain for budget accounting. Do not run it as routine CI.

`scripts/normalize-wardrobe-paths.mjs --expected-workspace=<uuid> --apply` repairs only the starter manifest's asset paths. It copies each image to the asset-ID directory, verifies the source and target hashes, updates the scoped asset with a revision check, and leaves old objects in place. Its rollback path record lives in ignored `supabase/.temp/wardrobe-path-rollback.json`. Without `--apply`, it verifies source hashes without changing paths. Old-object garbage collection requires a separate reference review.

The shared shell's workspace label, Profile counts and other features' inventory consumers are outside this change. Consumers can adopt the owned-inventory export without treating source type as ownership.
