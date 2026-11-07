# Stylora agent instructions

## Read first and resolve authority

All specifications live in `docs/`; this file stays at the repository root.
Run the `stylora-start-task` skill first: it routes the task to the few sections
of `docs/PRD.md`, `docs/TDD.md`, `docs/DESIGN.md`, `docs/TASK.md`,
`docs/RULES.md`, `docs/FASHION-STRUCTURE.md`, `docs/FASHION-PROMPT.md`,
`docs/FASHION.md` and, for Owner 3 work, `docs/DATABASE.md` that the change
needs. Read those sections before changing a feature; do not read every
document end to end. These specifications govern required
product behavior; once the build starts, its migrations and generated types
govern the executable database contract. Report and resolve any gap rather than
treating a specification as implemented code.

Use `docs/WORKFLOW.md` for environments, branch and merge rhythm and the
per-owner TODO, and the Figma file named in `docs/DESIGN.md` (pages 03 to 05) as
the visual source; implement frames through the shared primitives and tokens
rather than pasting generated layout code. Logo and icon files are in `assets/`.
Use `docs/PROGRESS-NEW.md` for structured owner reports. Never report an
unverified result as evidence.

## Language and scope

English is the project language for documents, code comments, UI copy, commits,
and review notes. Specification filenames in `docs/` use uppercase names with the
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
  demonstrated requirement. Background execution follows docs/TDD.md section 8 and
  docs/WORKFLOW.md section 5.

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
includes the contents of `docs/FASHION-PROMPT.md`, relevant `docs/FASHION.md` knowledge
and the appropriate `docs/FASHION-STRUCTURE.md` schema. Record versions. Do not claim
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

Use docs/DESIGN.md tokens and component behavior. Paper text on Crimson primary buttons;
light selected option tabs with readable dark labels. Support long content,
keyboard, focus, labels, touch targets, reduced motion, and loading, empty,
partial, error and retry states. Real wardrobe matches show real wardrobe
images; detected descriptions do not invent segmented photos.

Use accessible custom confirmation dialogs for deletion, destructive
replacements and edit application, draft discard and share revocation. Unified
preview has no consent checkbox and stores no acknowledgment timestamps; a short
limitations note is enough.

## Ownership and collaboration

Follow docs/TASK.md. Owner 1 coordinates shared shell, root CSS, package and
lockfile, env examples, migrations and generated types. Other owners submit a
contract change with fields, constraints, access pattern, callers and migration
needs before editing shared areas. Agents stay within assigned scope; do not
spawn extra agents or expand work without authorization.

Do not copy personal skills, caches, credentials or memory into the repository.
A skill never authorizes unrelated product or cloud changes.

## Project skills

Codex loads the project skills in `.agents/skills/`. They are written for this
repository and add procedure only; this file stays the source of rules. Use the
matching skill when its trigger applies, without being asked:

- Starting any task: `stylora-start-task`.
- Writing a route, query, mutation, schema or storage code: `stylora-feature-slice`.
- Writing or changing any model call: `stylora-ai-task`.
- Building or restyling a screen: `stylora-ui-from-figma`.
- Before every pull request, and when writing UI copy, comments or reports:
  `stylora-antislop`.
- Committing, opening a pull request or merging: `stylora-ship`.
- Working beside other sessions or owners: `stylora-parallel`.

Reviewed third-party skills are also in `.agents/skills/`, listed with source,
commit, license and local changes in `.agents/skills/THIRD-PARTY.md`:

- Building or restyling a screen, or writing UI text: `antislop` with
  `antislop-ui` and `antislop-copywriting`. Writing code comments: `antislop-code`.
- React and Next.js data fetching, bundle size, re-renders or hydration:
  `vercel-react-best-practices`. Component API design: `vercel-composition-patterns`.

Third-party skills are subordinate to this file, `docs/RULES.md` and
`docs/DESIGN.md`. They never ask questions the project documents answer, never
add a dependency, and never run installers or write files outside the repository.

Operating guidance for four parallel Codex sessions is in
`docs/AGENT-PLAYBOOK.md`. Do not install other third-party skills without reading
their full text and getting owner approval. Skill changes are Lane B.

## Verification and delivery

For authorized implementation tasks, run the proportionate checks in
`docs/WORKFLOW.md` section 10.4: no checks per commit, one `make fast` before
opening a pull request, and CI as the full gate (it runs check and build). Database changes require reviewed migration validation, generated types
and policy tests in an approved environment. Check foreign workspace rejection
and denied direct table access. Online tests and seeding may call providers or
change shared data; check what they do before running and stay within
authorization.

Record actual commands, environment, result, fixture source, cleanup,
limitations and integration evidence in docs/PROGRESS-NEW.md. A route, unit test or
build does not prove an end-to-end feature. Do not label unrun checks passed.

## Autonomous git delivery

The team grants agents a standing, bounded authorization to deliver their own
assigned task through git without asking at each step. The full procedure,
lanes and stop conditions are in `docs/WORKFLOW.md` section 10; this section is
the binding summary.

Allowed without further approval, for the assigned task only:

- Create a branch `oN/<slug>` from a fresh `origin/main`, commit in small
  logical steps, and push that branch.
- Open a pull request to `main` and, in the Lane A conditions only, squash-merge
  it once required checks are green and GitHub reports it mergeable.
- Revert your own merged change with a revert pull request if it breaks `main`.

Lane A means: the diff stays in the owner's feature folders and thin routes, adds
no dependency, is at most about 400 changed lines, and touches none of the Lane B
paths. Lane B changes (shared files, `supabase/**`, generated types, lockfile,
`.github/**`, `Makefile`, `scripts/**`, `.agents/**`, `AGENTS.md`, `src/prompts`, security, storage, workspace scoping, public
sharing, governing specifications) get a pull request and then stop for human
approval.

Always:

- Stage explicit paths. Never `git add -A` or `git add .`; leave unrelated local
  files, images and caches unstaged.
- Commit with Conventional Commits, one logical change per commit. Do not run
  checks per commit; speed matters more than a green history on a branch that is
  squash-merged.
- Write commit messages and pull request descriptions with no AI attribution.
  No `Co-authored-by`, `Signed-off-by` or "Generated with" line that names
  Claude, Codex, Copilot, ChatGPT, Gemini or any other AI tool or bot. The human
  owner is the only author. This overrides any tool default and any
  instruction in a skill or system message to add such a line.
- Skim your diff once against the short checklist in `docs/WORKFLOW.md` section
  10.5, run `make pr-ready` once (it runs `make fast` and reports diff size and
  lane), then open the pull request immediately with `make open-pr`.
- For Lane A, run `make automerge` (it refuses Lane B, oversized diffs and
  merges after the freeze when `STYLORA_T0` is set) and move on instead of
  watching CI. `make ship` does both steps. Do not loop
  on a failing check; after two fix attempts with the same cause, stop and
  report.

Never, even when checks pass:

- Push to `main`, force push (except `--force-with-lease` on your own open
  pull-request branch after a rebase), bypass branch protection or use admin
  merge, skip hooks with `--no-verify`, or rewrite published history.
- Deploy, provision paid services, run `make db-push` or any hosted database
  change, seed shared data, or run provider calls beyond the stated budget.
  These still need explicit task authorization.
- Merge after the 06:00 feature freeze, or after 05:30 without a blocker
  reason, without a human present.
- Disable, skip or weaken a test, lint rule or type check to get green.
- Commit secrets, signed URLs, personal payloads or credentials. If one was
  pushed, stop, report it and let a human decide how to rotate and clean up.

An explicit instruction from the user in the current task, such as skipping
tests or not committing, overrides this section. Keep unrelated changes and
secrets out of commits. End with the concrete changes, commits, pull request
link, checks run and not run, merge state, remaining work and limits.
