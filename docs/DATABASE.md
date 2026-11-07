# Owner 3 Supabase backend brief

Purpose: implementation brief for the engineer or coding agent building the
Owner 3 backend: outfit details, marketplace search, per-slot selection,
candidate import, immutable saved looks and image-led sharing. Read with
[PRD.md](PRD.md) (R28 to R32, R44, R45), [TDD.md](TDD.md) sections 4, 5, 10.6,
10.9, 10.10 and 11, and [WORKFLOW.md](WORKFLOW.md). Where this brief and those
documents differ, the PRD and TDD win.

## 1. Boundaries

- No login and no Supabase Auth. One shared workspace is selected by the
  server-side `STYLORA_WORKSPACE_ID`; every query filters by it, including
  child lookups. Never accept a workspace ID from the client.
- All Supabase access runs on the server with the secret key. RLS is enabled on
  every table and denies direct anon and authenticated access; the server's
  workspace predicates are the real guard and are reviewed separately.
- Schema changes go through Owner 1 as additive migrations. Owner 3 sends a
  contract note with fields, constraints, access pattern and callers.
- Option types are `closest`, `from_wardrobe` and `fresh_alternative`.
  Marketplace search only covers missing slots.
- Selecting a product or opening a seller link never creates ownership. Saving
  a product to wardrobe creates a saved candidate; only Mark as owned changes
  that.

## 2. User journeys and server behavior

| User action                 | Server behavior                                                                                                  | Result                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Open outfit details         | Load look, option and slots for the workspace; return per-slot status, candidates and cached search results      | Read only                                  |
| Automatic search            | When options commit, start one search per missing slot, up to three at once, cached by option revision and brief | Search rows and results per slot           |
| Retry or refine a search    | Validate slot and query, call SerpAPI with a timeout, normalize and store                                        | New search row; selection unchanged        |
| Choose a product for a slot | Validate option, slot, category and product; save the choice atomically with an expected revision                | Updated current selection                  |
| Save to wardrobe            | Import the allowed image and canonical description; deduplicate by idempotency key                               | Wardrobe row with `saved_candidate` status |
| Save this look              | Create the immutable snapshot and the avatar operation in one transaction                                        | Saved look plus media status               |
| Retry avatar                | Retry the media operation only                                                                                   | Media status updated; no duplicate look    |
| Create share link           | Build the allowlisted public snapshot, generate a high-entropy token, store only its hash, set expiry            | Share link; token shown once               |
| Read public share           | Hash the token, check workspace, expiry and revocation, return only the public snapshot and approved media       | Read only                                  |
| Turn off link               | Confirm, then set `revoked_at`                                                                                   | Public reads stop immediately              |

All writes use POST, PUT, PATCH or DELETE (or Server Actions) and report success
only after the database commit.

## 3. Tables owned or used by Owner 3

Every table has `workspace_id` and composite foreign keys on `(workspace_id,
id)`.

### `products`

| Column                                      | Meaning                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `id`                                        | UUID                                                               |
| `provider`, `provider_product_id`           | Stable provider identity, unique per workspace                     |
| `title`, `category`, `source_label`         | Returned catalog fields; category normalized to the six values     |
| `product_url`, `image_url`                  | Validated HTTPS URLs                                               |
| `price_minor`, `shipping_minor`, `currency` | Integer minor units; null when unknown, never zero                 |
| `rating`, `review_count`                    | Null when not returned                                             |
| `attributes`                                | Canonical item attributes derived from the catalog with provenance |
| `retrieved_at`                              | Retrieval time; not a promise of stock or price                    |

### `shopping_searches` and `shopping_results`

Searches: option item, normalized query, provider, country, status (`running`,
`succeeded`, `empty`, `failed`, `unavailable`), score weights, score version,
safe error code, created time. Results: search, product, position, factors,
value score and explanation. One row per search and product.

### Selection

`look_selections` (one per look: chosen option, revision) and
`look_selection_items` (one choice per slot, pointing to a candidate in that
option). Changing one slot leaves the others untouched.

### `saved_look_snapshots` and `saved_look_media`

The snapshot stores title, source option, revision, items (ID, category, label,
image reference, ownership at save, source, known price), rationale, inputs
used and uncertainty. It is immutable. Media rows store the avatar operation,
preference snapshot hash, output asset and status (`queued`, `running`,
`succeeded`, `failed`).

### `share_links`

`saved_look_id`, `token_hash` (64 hex characters), `catchphrase` (up to 240
characters), `public_snapshot` (title, catchphrase, item names, categories,
colors), approved media IDs, `expires_at`, `revoked_at`, created time. Never
store the raw token. Never include preferences, notes, private paths or the
wider wardrobe.

## 4. Value Score

Deterministic and visible. Default weights price 0.3, rating 0.2, relevance
0.5, adjustable by the user. Factors are normalized over available evidence;
missing price or rating is absent, not zero. Price comparison only within one
currency; shipping and freshness limitations are explained. The score version is
stored with each result. An LLM may explain fashion relevance using
FASHION-PROMPT.md but never sets the number.

## 5. Candidate import

Accept only a scoped product reference, expected revision and idempotency key.
Fetch the image from an allowed provider host, reject private or loopback
addresses, recheck redirects, cap bytes and MIME, store it privately, write the
canonical description, and create the wardrobe row as `saved_candidate`. If
the image copy fails, keep a pending import with retry and show that state.

## 6. Security checklist

- Workspace predicate on every query and child relation.
- RLS enabled, direct table access denied.
- Secret key server-only; never in `NEXT_PUBLIC_` variables.
- No logging of tokens, signed URLs or provider payloads.
- Public share reads go through one narrow endpoint with hash lookup.
- Private buckets only; signed URLs generated after checks and never stored.

## 7. Suggested indexes

Workspace plus look and option on option items; workspace, provider and provider
product ID on products; search ID and position on results; workspace and created
time on saved looks; unique token hash plus expiry and revocation on share
links.

## 8. Definition of done

- Details page loads every slot after reload, with per-slot search states.
- Three missing-slot searches run concurrently and fail independently.
- Changing one slot leaves others unchanged; reload restores choices.
- Saved candidates never appear in owned matching or capsules.
- Unknown price and rating stay unknown through UI, server and snapshots.
- Saved looks reopen the same snapshot after the live look changes.
- Avatar failure leaves the saved look intact, with retry.
- Public share returns only the allowlisted snapshot and approved media, and
  stops after expiry or revocation.
- Checks and evidence recorded in PROGRESS-NEW.md.

## 9. References

- [Supabase secure data](https://supabase.com/docs/guides/database/secure-data)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase CLI workflows](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase generated types](https://supabase.com/docs/guides/api/rest/generating-types)
