# Stylora agent instructions

## Read first and resolve authority

Read `PRD.md`, `TDD.md`, `DESIGN.md`, `TASK.md`, `RULES.md`,
`FASHION-STRUCTURE.md`, `FASHION-PROMPT.md`, and the relevant sections of
`FASHION.md` before changing a feature. These specifications govern required
product behavior; once the build starts, its migrations and generated types
govern the executable database contract. Report and resolve any gap rather than
treating a specification as implemented code.

Use `WORKFLOW.md` for environments, branch and merge rhythm and the per-owner
TODO, and the Figma file named in `DESIGN.md` (pages 03 to 05) as the visual
source; implement frames through the shared primitives and tokens rather than
pasting generated layout code. Use `PROGRESS-NEW.md` for structured owner
reports. Never report an unverified result as evidence.

## Language and scope

English is the project language for documents, code comments, UI copy, commits,
and review notes. Root specification filenames use uppercase names with the
`.md` extension. User-facing copy uses sentence case and avoids slash-separated
labels. Code identifiers, paths and literal catalog data retain their valid
form.

All PRD features belong to the seven-hour, four-owner delivery. Do not silently
reduce scope or describe omitted required features as an MVP. The app has no
auth and one shared workspace. All visitors can change shared data when writes
are enabled. Do not add login, user ownership, private-data promises or
personal-photo identity recreation without an explicit scope change.

Honor the active task boundary. A documentation task changes Markdown only and
does not authorize implementation, cloud operations or running provider calls.
If the user excludes tests or build, record them as not run instead of executing
them. Do not stage unrelated local files, images or caches.

## Implementation boundaries

- Strict TypeScript and Server Components by default. Use client components for
  browser interaction, not to move secrets into the browser.
- Keep `src/app` routes thin. Feature business logic lives in
  `src/features/<feature>`; add schema, actions, queries or component subfolders
  only when useful.
- All Supabase access is server-only. Browser uploads use a server-issued signed
  Storage URL and do not require a browser Supabase client.
- Every read, mutation, RPC and child lookup is scoped to server-side
  `STYLORA_WORKSPACE_ID`, including parent membership. Never accept a client
  workspace ID.
- `SUPABASE_SECRET_KEY` bypasses RLS. Keep RLS enabled, deny direct anon and
  authenticated access to internal tables, and audit privileged server
  predicates separately.
- Validate request bodies, actions, query parameters, provider output and nested
  fashion data with Zod. Domain validation follows schema validation.
- Use the configured hosted Supabase project for application persistence.
  Disposable local databases are optional test environments. Never reset the
  hosted database.
- Buckets remain private. Enforce MIME, byte limits, verified bytes and random
  scoped paths. Store paths and asset IDs, never permanent signed URLs. Restrict
  remote image sources and redirects.
- Never log secrets, personal payloads, signed URLs or unrestricted provider
  output. Safe error codes and operation metadata are sufficient.
- Migrations are the source of truth. Owner 1 owns migrations and generated
  types. Create new migrations using the CLI; never edit an applied migration or
  hand-edit generated database types.
- Do not add ORM, state library, queue, SDK or empty service layers without a
  demonstrated requirement. Background execution follows TDD.md section 8 and
  WORKFLOW.md section 5.

## State and asynchronous work

All pages retain meaningful drafts, selections, filters and results. Navigation
must not erase analysis. Do not show a warning that normal navigation
destroys progress. Confirm only actual discard or destructive changes.

Create has a top stepper with Upload, Review pieces, Wardrobe match, Outfit
ideas and Outfit details. Previous visited steps are navigable; future steps are
not shortcuts. Marketplace belongs inside outfit detail. Preview has a primary
navigation entry.

Start provider work automatically only when inputs are complete and stable. Run
independent tasks concurrently with bounded quotas. Persist operation identity,
input fingerprints, revisions and result references. A database job row is not
an executor. Do not use timers or un-awaited promises as durable background
work. Reject stale completions and deduplicate retries.

Navigate to the destination immediately with a tailored skeleton. Stream
complete schema-valid garment descriptions rather than simulating progressive
output. Keep partial results provisional until final validation. Save success
and image-generation success are separate states.

## Fashion and AI integrity

Every fashion analysis, recommendation, regeneration and image-direction request
includes the contents of `FASHION-PROMPT.md`, relevant `FASHION.md` knowledge
and the appropriate `FASHION-STRUCTURE.md` schema. Record versions. Do not claim
a prompt file is used merely because it exists.

Use canonical item attributes throughout the app. Keep user facts, inferred
observations, catalog facts and corrections distinct. Skin tone, undertone, body
profile and fit preferences are optional user selections, never inferred from
the inspiration wearer. Only claim preference signals that were actually
supplied and used.

Every recommendation includes concrete Why this reasons, evidence, differences
and uncertainty. Apply functional matching gates before scoring; broad category
and color similarity do not make a sport-specific garment a formal alternative.
Never invent wardrobe IDs or model output. Unconfigured or failed providers
return a clear unavailable state. Samples remain explicit and separate.

Marketplace saves create labeled candidates until the user explicitly marks them
owned. From-wardrobe recommendations use owned rows only. Capsule reasoning uses
text and IDs, not inventory photographs. Avatar generation uses selected visual
preferences and specific swatch values, with natural poses and illustrative
limitations.

## Design and accessibility

Use DESIGN.md tokens and component behavior. Paper text on Crimson primary buttons;
light selected option tabs with readable dark labels. Support long content,
keyboard, focus, labels, touch targets, reduced motion, and loading, empty,
partial, error and retry states. Real wardrobe matches show real wardrobe
images; detected descriptions do not invent segmented photos.

Use accessible custom confirmation dialogs for deletion, destructive
replacements and edit application, draft discard and share revocation. Unified
preview has no consent checkbox and stores no acknowledgment timestamps; a short
limitations note is enough.

## Ownership and collaboration

Follow TASK.md. Owner 1 coordinates shared shell, root CSS, package and
lockfile, env examples, migrations and generated types. Other owners submit a
contract change with fields, constraints, access pattern, callers and migration
needs before editing shared areas. Agents stay within assigned scope; do not
spawn extra agents or expand work without authorization.

Do not copy personal skills, caches, credentials or memory into the repository.
A skill never authorizes unrelated product or cloud changes.

## Verification and delivery

For authorized implementation tasks, run relevant `pnpm check` and `pnpm build`
checks. Database changes require reviewed migration validation, generated types
and policy tests in an approved environment. Check foreign workspace rejection
and denied direct table access. Online tests and seeding may call providers or
change shared data; check what they do before running and stay within
authorization.

Record actual commands, environment, result, fixture source, cleanup,
limitations and integration evidence in PROGRESS-NEW.md. A route, unit test or
build does not prove an end-to-end feature. Do not label unrun checks passed.

Do not commit, push, deploy, provision paid services or modify the remote
database merely because checks pass. Obtain authorization from the task. Keep
unrelated changes and secrets out of commits. End with the concrete changes,
evidence, remaining work and limits.
