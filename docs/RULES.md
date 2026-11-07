# Stylora product and engineering rules

These rules apply to the complete scope in [PRD.md](PRD.md). [TDD.md](TDD.md)
defines technical contracts, [DESIGN.md](DESIGN.md) defines interaction and
visual behavior, [TASK.md](TASK.md) assigns accountability, and
[AGENTS.md](../AGENTS.md) governs agent execution.

## 1. Product integrity

All requested features remain in the seven-hour delivery scope. Track incomplete
work explicitly; do not hide it behind an MVP label. English is the project
language. User-facing copy uses sentence case, readable short explanations and
no slash-separated labels. Preserve literal identifiers and source data where
correctness requires them.

Every page retains meaningful work across navigation and reload. The Create
stepper stays at the top, permits revisiting earlier visited steps and prevents
jumping ahead. Ordinary navigation never destroys analysis. Marketplace is part
of selected outfit detail, and Preview is a primary destination.

## 2. Fashion contracts

Every item description, inferred attribute, wardrobe entry, product
normalization, missing brief, capsule slot, preview composition and saved
snapshot follows [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md). Category-specific
fields must be meaningful. Unknown values remain unknown. Keep observed
appearance separate from exact catalog facts and user corrections.

Every LLM fashion task includes [FASHION-PROMPT.md](FASHION-PROMPT.md) and
relevant [FASHION.md](FASHION.md) content. Every recommendation includes
concrete Why this reasons, evidence references, actual inputs used, tradeoffs
and uncertainty. Do not expose internal field names or hidden reasoning
transcripts as user explanations.

Skin depth, undertone, body profile and fit preferences are optional and
self-selected. Never infer them from inspiration photos. Do not rank bodies or
skin tones, prescribe compulsory palettes, promise fit or invent measurements.
Avatar appearance uses explicit selected swatches and body references, with
approximate-rendering disclosure.

Matching applies functional and occasion compatibility before scoring. A
football jersey cannot become a close formal-fashion alternative on color alone.
Favor honest missing results over implausible reuse. Exactly three inspiration
directions are required; the from-wardrobe direction uses only owned rows. Do
not show estimated budgets on the three recommendation cards.

Capsules contain multiple distinct outfits and explain reuse. Use wardrobe text
and IDs for capsule reasoning. Missing additions must unlock concrete
combinations; do not invent wear counts, cost-per-wear or environmental savings.

## 3. Provider and task execution

Provider requests run server-side. Validate provider JSON and then domain truth:
allowed IDs, parent membership, category applicability, required types, source
revision and preference evidence. Failed or unconfigured AI returns unavailable;
samples are explicitly labeled and never substituted silently.

Prepare AI and search tasks automatically only for complete stable input. Run
independent tasks in parallel with bounded concurrency, quotas and retry
budgets. Persist job identity and results. Reject stale results, deduplicate
identical work and retain completed upstream steps on retry.

A queue row is not a worker and a Vercel request is not durable execution. Do
not return success while relying on an un-awaited promise. Navigate immediately
to destination skeletons. Stream validated complete pieces, not simulated typing
after completion.

## 4. Shopping, ownership and imagery

Preserve provider attribution, returned fields, retrieval time and validated
links. Unknown price, rating, reviews, stock and shipping remain null. Value
Score exposes factors, weights, missing-data treatment and version.
Same-currency comparisons and relevance evidence are required; cheapest does not
automatically mean best.

Search only missing or product slots and keep state per option. Each result
supports Save to wardrobe with image and canonical description. Imported
suggestions are saved candidates until explicitly marked owned. Candidates are
excluded from owned-only matching and capsule membership.

Use actual wardrobe images for owned and alternative matches. Never imply text
detection generated segmented item photographs. Missing briefs use text or
honest symbols; generated imagery is labeled illustrative. Catalog image fetches
are source-restricted, size-limited and validated.

Save this look persists an immutable snapshot and automatically schedules its
avatar. Image failure does not erase the saved look. Preview can save a look and
reuse matching generated media. Public sharing is image-led and restricted to
approved media and display data.

## 5. Shared workspace and security

The app has no login. All visitors use the same shared dataset when writes are
enabled. Do not promise personal ownership of the workspace, account privacy or
a private wardrobe. Use non-sensitive outfit references and synthetic
personalization; no personal model-photo upload.

All Supabase access is server-only and scoped to the configured workspace,
including children and RPCs. RLS stays enabled and direct anon and authenticated
access to internal data stays denied. Audit secret-key queries separately
because the key bypasses RLS.

Private buckets store random scoped paths. Signed URLs are short-lived
capabilities, never permanent identities. Do not log them. No arbitrary URL
fetches from client input. Keep secrets out of source, public bundles,
screenshots, logs and documents; env examples contain names and placeholders
only.

Sharing uses an explicit snapshot, random token with hash-only storage, expiry
and one-way revocation. Public media access rechecks the token and snapshot. No
full profile, internal IDs, private paths or unrestricted wardrobe relations are
disclosed. Revocation cannot retract downloaded copies.

## 6. Technical quality and schema control

Use Next App Router, strict TypeScript, Server Components by default, thin
routes, feature-owned logic and Zod validation. Keep dependencies purposeful and
pinned. Do not introduce another database, ORM or state library without a
concrete need.

Owner 1 owns migrations and generated types. Applied migrations are immutable.
New requirements need reviewed additive contracts, not hand-edited generated
types or permissive client-only workarounds. Hosted Supabase is the application
target; local reset commands are for disposable local databases only.

The preview has no consent checkbox. The API and database define no
acknowledgment requirement; do not manufacture user consent timestamps. Keep the non-identifying avatar boundary and concise limitations
disclosure.

## 7. Interface rules

Use the shared palette with tested contrast, consistent primary-action
placement, Paper labels on Crimson buttons and light Blush active outfit tabs. Support
long text, real images, missing images, mobile layouts, keyboard and visible
focus. Status requires a text or icon cue as well as color.

Every page has tailored loading, empty, partial, success, failure and retry
states. Landing autoplay explains real feature concepts, has pause and
reduced-motion behavior, and never spends live API credits. Forms use clear
labels and meaningful visual options; free-text inputs preserve spaces.

Confirm irreversible actions and destructive edit application through custom
accessible dialogs. Name the affected object and consequence. Do not block safe
navigation with a progress-loss warning. No generic browser alerts for these
flows.

## 8. Collaboration and evidence

Respect TASK.md ownership and coordinate shared files before editing. Preserve
unrelated files and local data. Agents may commit, push their own branch, open
pull requests and merge Lane A changes as defined in
[WORKFLOW.md](WORKFLOW.md) section 10 and [AGENTS.md](../AGENTS.md). Deployment,
paid services and remote data changes still need task authorization. A
documentation-only task does not authorize implementation or verification that
changes application state.

Record actual results in PROGRESS-NEW.md, including commands not run and why.
Respect an explicit instruction to skip tests or build. Builds and unit tests do
not prove live provider success, durable execution or a complete connected
journey. Report save success and avatar success separately, and document cleanup
of test records when applicable.
