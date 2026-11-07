# Owner 2 frontend integration contract

This change connects the existing Create, Preferences and Profile surfaces to
hosted persistence. It adds no migrations, generated types or dependencies.
All privileged reads and writes use the server workspace; requests never accept
a workspace ID. Mutations enforce the existing writes gate.

## Inspiration context

`PATCH /api/looks/[lookId]/context` accepts:

```json
{ "expectedRevision": 1, "occasion": "Everyday" }
```

`occasion` is a required nullable string, trimmed and limited to 120 characters.
An empty string clears it. The result is
`{ lookId, revision, occasion, changed }` in the normal API data envelope.
Foreign or missing looks return 404; an outdated revision returns 409.

A changed occasion and the incremented look revision commit in one scoped
compare-and-swap update. The selected option reference is cleared. The upload,
piece IDs, garment attributes, evidence and corrections are preserved. No
multi-table invalidation sequence is needed: existing results retain their
source revision and existing completion RPCs fence workers against the changed
look revision. Matching and option reads already restrict source revisions.
The confidence-review projection must also compare its source revision with
the current look revision when calculating `stale`.

The frontend saves the canonical look context before updating its draft mirror
or starting dependent operations. It reloads after success and keeps unsaved
input on conflict. Existing descriptions are retained; an occasion change
refreshes dependent advice, matching and ideas without replacing reviewed
pieces. An unfinished description captured under the old revision must restart
under the new revision.

## Regeneration intent

`POST /api/looks/[lookId]/outfit-options/[optionType]/regenerate` additionally
accepts optional `intentId`, a UUID. Other existing revision, option identity,
inventory mode and execution fields retain their meaning.

The frontend creates one intent UUID per explicit Suggest another action and
retains it while obtaining and executing that operation. The intent is persisted
in operation input and included in its fingerprint. Repeating the same intent
with unchanged inputs deduplicates; a new action after cancellation gets a new
intent and can start a new operation. Requests without an intent retain the
existing deduplication behavior. Other operation kinds reject an intent.

## Profile statistics and activity

The root-owned `GET /api/profile` gains `stats` with nullable numeric
`wardrobeItems`, `savedLooks`, `capsules` and `activeShares` fields. Counts use
actual workspace rows, excluding archived wardrobe items. Counts include labeled
sample rows when those are present. A null count means unavailable.

The Activity panel reuses the operation collection endpoint merged from Owner 4.
Its safe projection includes `id`, `kind`, `status`, `subjectType`, `subjectId`,
`inputRevision`, `attemptCount`, `safeErrorCode`, `createdAt` and `updatedAt`.
The fixed landing preparation operation is excluded. Provider payloads,
credentials and signed asset URLs are excluded.

Browser-local preview stores are not persistence for these reads. Unavailable
reads show an unavailable state rather than invented counts or activity.
Sample looks are read-only: the context endpoint and operation-start path reject
`source_type=sample`. Explicit sample wardrobe matching for a real uploaded look
remains available and labeled separately.

## Create routes and detail handoff

Upload uses `/create?draft=<UUID>`. The other Owner 2 steps use
`/create/<lookId>?step=review|matches|ideas&draft=<UUID>`; the dynamic route also
accepts `step=upload` for restoring a look without a browser recovery registry.
This preserves Owner 3's `/looks/<lookId>?option_id=<UUID>` route. Its earlier-step
links redirect to Create, retaining a valid draft parameter. `GET /api/looks/<id>`
adds scoped `activeDraftId` to restore navigation from outfit detail.

After three current options commit, the client prefetches ready detail routes
and publishes `stylora:outfit-options-committed` with look revision, option IDs,
option revisions and slot IDs, revisions and missing briefs. A single-option
regeneration publishes the replacement identity after commit. Detail queries
exclude historical options and options from older look revisions.

The operation read projection additionally includes `optionType`, `subjectId`
and, on the operation status endpoint, `leaseUntil`. Regeneration's input revision
belongs to the option; its captured look revision remains in the operation input.

The canonical fashion validator uses `TextEncoder` for its unchanged UTF-8 byte
limit so client adapters can reuse it without Node globals. Request DTOs strip
read-only provenance metadata before piece PATCH; the server preserves provenance
and records corrections.

## Fixed landing sample

`STYLORA_LANDING_SAMPLE_LOOK_ID` selects one sample look in the configured
workspace. The preparation script requires `--write-fixed-sample`, stores a
sample asset, look and operation before one OpenAI Responses request, validates
the output and stores the canonical result in a completed operation event. It
never repeats a preparation that already has an operation. A failed preparation
does not retry or substitute invented output.

The request includes full FASHION-PROMPT.md, relevant knowledge sections
2, 3, 4, 7, 8, 9 and 13, and structure sections 3, 7, 8 and 9. Model, request ID,
usage, document hashes and latency are recorded. Landing and `/sample` only read
this snapshot and sign scoped asset references; they never invoke a model.

## Remaining boundaries and evidence

Wardrobe matching retains its explicit sample adapter until the teammate's
live inventory integration is ready. Owner 3 detail and shopping screens are now
merged and the committed-option handoff is connected; shopping provider behavior
was not exercised. Per-piece preference advice is unavailable in the current
garment DTO and is not fabricated from global confidence insights.

The authorized fixed sample preparation made one provider call and scoped sample
writes. Visual inspection runs the development server and read-only views.
The user subsequently authorized brief backend checks. The backend HTTP smoke
passed seven checks with 26 requests and no inference, restoring original settings
and cleaning its temporary rows and private object. Frontend tests, make fast,
lint, typecheck, build and the frontend E2E journey were not run. Static review
and screenshots do not prove live end-to-end frontend behavior.
