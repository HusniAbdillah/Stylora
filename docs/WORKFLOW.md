# Stylora delivery workflow and seven-hour TODO

This is the working agreement for four developers building every feature in
[PRD.md](PRD.md) within seven hours. Ownership comes from [TASK.md](TASK.md),
contracts from [TDD.md](TDD.md), visuals from [DESIGN.md](DESIGN.md) and the
[Stylora Design System](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System)
Figma file (pages 03, 04 and 05). Report evidence in
[PROGRESS-NEW.md](PROGRESS-NEW.md). This document recommends a process; it does
not authorize cloud changes, deployments or paid usage by itself.

## 1. Decisions to lock in the first fifteen minutes

| Decision             | Recommendation                                                                                                      | Owner          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| Names to owners      | Write the four names next to Owner 1 to 4 in TASK.md before anyone codes                                            | Team           |
| Repository           | New repository, Next.js app scaffold, CI and PR template created at 00:00 by Owner 1 (README setup steps)           | Owner 1        |
| Database target      | One new hosted Supabase project in the Singapore region is the only runtime database                                | Owner 1        |
| Data isolation       | One `STYLORA_WORKSPACE_ID` per developer plus `demo` and `preview` workspaces in the same project                   | Owner 1        |
| Background execution | Option A in section 5 for the build, Option B only if Owner 4 is ahead at the 04:00 checkpoint                      | Owners 2 and 4 |
| Streaming strategy   | Try provider streaming for 20 minutes; if strict JSON streaming fails, switch to manifest plus per-piece calls      | Owner 2        |
| Merge windows        | Fixed windows in section 3, squash merge, main always deployable                                                    | Owner 1        |
| Provider budget      | Cap per developer: 150 Muse text calls, 20 image calls, 100 SerpAPI searches; cache everything by input fingerprint | Team           |
| Demo safety          | Sample look path, pre-seeded demo wardrobe and a recorded backup video ready by 06:30                               | Team           |

## 2. Environments: hosted Supabase, not a local stack

Short answer: develop locally with `pnpm dev`, but point every machine at the
same hosted Supabase project. Do not run a local Supabase stack during the
hackathon, and never point local code at the demo data.

Why: Docker startup, image pulls and local seeding typically cost 20 to 40
minutes per machine, and four local databases drift from each other and from
the deployed schema. Every server query is scoped by `STYLORA_WORKSPACE_ID`
(TDD section 2), so separate workspace rows give each developer isolated data in
one database at no cost.

| Environment             | Runs where              | Database and workspace                         | Writes |
| ----------------------- | ----------------------- | ---------------------------------------------- | ------ |
| Developer laptop        | `pnpm dev`              | Hosted project, `dev-owner-1` to `dev-owner-4` | On     |
| Pull request preview    | Vercel preview          | Hosted project, `preview` workspace            | On     |
| Demo and judging        | Vercel production, main | Hosted project, `demo` workspace, seeded       | On     |
| Optional migration test | Owner 1 laptop only     | Local Supabase stack via the Supabase CLI      | Local  |

Rules:

1. Only Owner 1 changes schema. Create each migration file with the Supabase
   CLI's new-migration command, keep later migrations additive, open a PR, and
   after review push the migration to the hosted project with the CLI, then run
   `pnpm db:types` and commit the generated database types file in the same PR.
   Never edit a pushed migration, never use the dashboard Table Editor for
   schema and never reset the hosted database.
2. Other owners send schema needs as a contract note (TASK.md section 8) and
   build against the generated types once merged. Until then, code against the
   Zod contract and keep the persistence call behind one function.
3. `.env.local` stays on each laptop. Vercel holds three sets of variables:
   production (demo workspace), preview (preview workspace) and development is
   not used. Never prefix secrets with `NEXT_PUBLIC_`.
4. Storage buckets are shared; paths already start with the workspace ID, so
   developers do not collide.
5. Seed the `demo` workspace once from the team dataset with a small seed
   script after team approval, then treat it as read-mostly until rehearsal.
6. If the optional local stack is used, it is only to dry-run a risky
   migration. Its result is never evidence that the hosted schema matches.

## 3. Git, pull requests and merge rhythm

- `main` is always deployable and auto-deploys to Vercel production. Protect
  it: pull requests only, CI green, one approval.
- Branch names: `o1/wardrobe-grid`, `o2/review-stream`, `o3/marketplace`,
  `o4/capsule-wizard`. A branch lives at most 90 minutes; split bigger work.
- Each PR stays under roughly 400 changed lines, includes the Figma frame ID it
  implements (for example D04 and M04), a screenshot or preview link, and the
  checks run. Use the pull request template created at setup.
- Before opening a PR: `git fetch`, rebase on `origin/main`, `pnpm check`. Open
  the PR, let CI and the Vercel preview finish, click the changed flow once on
  the preview, then request review.
- Reviewer rotation: Owner 1 reviews 2, Owner 2 reviews 3, Owner 3 reviews 4,
  Owner 4 reviews 1. Owner 1 must also approve any change to shared files.
- Squash merge. Delete the branch. Everyone rebases within 10 minutes of each
  merge window.

Shared files with a single owner (Owner 1): `src/app/globals.css`,
`src/app/layout.tsx`, the workspace shell, `package.json`, `pnpm-lock.yaml`,
`.env.example`, `supabase/**`, `src/types/database.ts`, and the shared UI
primitives folder. Feature owners touch only their feature folders and their
thin route files.

| Merge window | What lands                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| 00:40        | Contracts PR from Owner 1: tokens, primitives, Zod contracts, baseline migration and types           |
| 01:30        | First vertical slices behind real routes, skeletons included                                         |
| 02:30        | Upload to review with real AI; wardrobe intake; marketplace search; capsule wizard; operation runner |
| 03:30        | Matching, three ideas, integrated shopping, save with avatar job, preview page                       |
| 04:30        | Saved looks, share and revoke, capsule results, preferences complete, landing demo                   |
| 05:15        | Last feature merge. After this, fixes only                                                           |
| 05:30        | Integration lock: no schema, dependency or shared CSS change without all four owners                 |
| 06:00        | Feature freeze. Only blocker fixes with a second reviewer                                            |

## 4. Building from Figma with MCP

1. Open the frame for your task on page 04 or 05 and read the matching row on
   the Handoff notes board (page 03).
2. In Claude Code or Codex with the Figma MCP, request the design context for
   that frame ID. Treat the output as a reference: map it onto the shared primitives
   (Button, Chip, StatusBadge, Stepper, Skeleton, ConfirmDialog, Toast) and the
   CSS tokens instead of pasting raw hex values or absolute positions.
3. Images in the frames are reference assets. In code, owned items and
   products always come from Storage or the provider; generated stand-ins are
   never shipped as real data.
4. Compare your screen with the frame at 1440 px and 390 px before opening the
   PR. Check long text, empty and error states, keyboard focus and reduced
   motion.

| Owner | Desktop frames                                             | Mobile frames                |
| ----- | ---------------------------------------------------------- | ---------------------------- |
| 1     | D07 to D09, D20 to D22, D29 to D32, R02, shell and dialogs | M07, M08, M14, M15, M17, M23 |
| 2     | D01 to D05, D17 to D19, R01                                | M01 to M05, M16              |
| 3     | D06, D14 to D16, D27, D28                                  | M06, M12, M13, M18, M22      |
| 4     | D10 to D13, D23 to D26                                     | M09 to M11, M19 to M21       |

## 5. Background work that fits seven hours

PRD R04 to R06 need work to start early, run in parallel and survive
navigation. A database row is not an executor (TDD section 8). Two honest
options:

**Option A, recommended for the build.** Persist an operation row (kind,
subject, input fingerprint, revision, status, result reference) before calling
a provider. The client starts the operation as soon as inputs are complete,
from a module-level store that is not tied to a page component, so client-side
navigation does not cancel it. The route handler awaits the provider within its
`maxDuration`, validates, commits the result and marks the operation complete.
A repeated start with the same fingerprint returns the existing operation
instead of calling the provider again. If a lease expires without a result, the
next visit restarts it. This survives page changes and tab switches inside the
app; it does not survive a server function crash. Record that limitation in
PROGRESS-NEW.md; do not describe it as a durable queue.

**Option B, target if time allows.** Supabase Queues with a dedicated worker
or an Edge Function consumer, as specified in TDD section 8.2. Start only if
Option A is merged and green at the 04:00 checkpoint.

Parallel calls: description and Review with confidence are two separate
requests started together; missing-slot searches run with a pool of three;
avatar images run one at a time per workspace. Collect results with a settle-all pattern, not a fail-fast one,
so one failure never hides the others.

## 6. Seven-hour timeline

| Time        | Outcome                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 00:00–00:15 | Repo, Supabase and Vercel created; decisions in section 1; one provider ping each                                   |
| 00:15–00:40 | Contracts written and merged; everyone rebases                                                                      |
| 00:40–02:00 | Foundations per owner with real routes and skeletons                                                                |
| 02:00       | Checkpoint 1: upload to real description, wardrobe intake, one marketplace search, operation runner demoed live     |
| 02:00–04:00 | Connected Create flow, save with avatar, preview, capsule generation                                                |
| 04:00       | Checkpoint 2: full Create journey on the preview deployment, resume after navigation, real provider evidence logged |
| 04:00–05:15 | Sharing, saved looks, preferences detail, landing demo, empty and error states, mobile pass                         |
| 05:15–05:30 | Last merges; integration lock                                                                                       |
| 05:30–06:00 | Cross-feature bug fixing; demo workspace seeded and frozen                                                          |
| 06:00–06:30 | Feature freeze; smoke test on production; record backup demo video                                                  |
| 06:30–07:00 | Rehearse the pitch twice; final PROGRESS-NEW.md handoff                                                             |

## 7. Detailed TODO

Tick items in your own copy or in the PR description. Every item names its
frame and its done condition. Do not start an item whose dependency is open;
pick the next one.

### Owner 1: foundations, wardrobe, preferences, profile

- [ ] 00:15 Create workspace rows `demo`, `preview`, `dev-owner-1` to
      `dev-owner-4`; share IDs privately. Done: each laptop reads its own empty
      wardrobe.
- [ ] 00:20 Map the Figma `Stylora / Light` variables to CSS custom properties
      and Tailwind theme keys (Crimson `#73091D`, Crimson deep, Ink, Porcelain,
      Paper, Night, Blush, Rose wash, Camel, Sand, Sage, Stone, Secondary,
      status pairs, radius tokens). Done: no feature file uses a raw hex.
- [ ] 00:25 Shared primitives: Button (Primary, Secondary, Quiet in Large and
      Medium), Chip, StatusBadge, Stepper, Skeleton, ConfirmDialog, Toast,
      Logo lockup and mark from the master SVG. Done: one story or test page
      renders all states.
- [ ] 00:30 Zod contracts: `fashion-item.v1`, explanation envelope, preference
      keys with `skinSwatchId` and `skinSwatchHex`, operation status enum.
- [ ] 00:35 Baseline migration from TDD sections 5 and 13: operations and
      events, drafts, `inventory_status`, `saved_look_media`, public media
      allowlist, preview tables with no consent fields, capsule proposed slots.
      Push, `pnpm db:types`, merge at 00:40.
- [ ] 01:00 Workspace shell: sidebar with Create, Wardrobe, Capsules, Preview,
      Saved looks, Preferences; profile chip; mobile drawer (M14); bell with
      Activity panel reading the operations endpoint (D17). The shell shows no
      progress-loss warning.
- [ ] 01:30 Wardrobe grid D07 and M07: category tabs, search, Owned and Saved
      candidates filter, 4 columns desktop, 3 columns mobile, image tiles.
- [ ] 02:15 Upload-only intake D08: signed upload, wardrobe description task
      with FASHION-PROMPT.md, editable AI fields with AI tags, multiple-garment
      prompt, Cancel bottom left and Add to wardrobe bottom right.
- [ ] 03:00 Candidate support: Mark as owned action, owned-only query helper
      used by matching and capsules, import endpoint contract for Owner 3.
- [ ] 03:45 Preferences D09 and M08: skin swatches with stable IDs and hex,
      undertone palettes, contrast blocks, body illustrations with women's and
      men's tabs, fit, style photos, life and comfort chips, draft autosave,
      reset with confirmation.
- [ ] 04:30 Preference normalization adapter (`skin_depth` and swatch) and
      revision fingerprint published to every AI task.
- [ ] 05:00 Profile page, accessibility pass on shell and dialogs, 390 px pass.
- [ ] 05:30 Final type regeneration if needed; verify no pending migration.

### Owner 2: landing and Create steps 1 to 4

- [ ] 00:30 Publish the streaming event and three-option payload contract.
- [ ] 01:00 Create route with URL step state, top stepper (back to visited
      steps only), draft restore from server, route `loading.tsx` skeletons.
- [ ] 01:30 Upload D02 and M02: contain-sized image, Replace and Remove,
      Analyze inspiration beside the image and top right, occasion chips,
      preference card with set and missing states.
- [ ] 02:00 Start description and Review with confidence in parallel as soon
      as the upload is verified; Analyze only navigates.
- [ ] 02:45 Review D03 and M03: complete pieces appear as they validate, the
      separate confidence panel, swatches, attribute groups, evidence line, For
      you note, streaming skeleton, independent retries.
- [ ] 03:15 Piece editor drawer with suggestions and free text, revision
      conflict handling, destructive edit confirmation (D17).
- [ ] 03:45 Matching with hard functional gates, background start on a stable
      revision, Match D04 and M04 with real wardrobe photos, rejected candidate
      note, counts as plain integers.
- [ ] 04:30 Ideas D05 and M05: three fixed types, collage of real photos and
      missing tiles, Why this, inputs used, uncertainty, Suggest another per
      option, empty wardrobe and missing preference cards. Trigger Owner 3
      prefetch on commit.
- [ ] 05:00 Landing D01 and M01: hero with sample photo and scan, autoplay
      demo with pause and reduced motion, feature bento linking to routes,
      About with flat-lay, crimson CTA and night footer.

### Owner 3: details, marketplace, saving and sharing

- [ ] 00:30 Publish selected look, product and share contracts.
- [ ] 01:15 Details D06 and M06: Blush option tabs, composition with status
      badges, Why this card, Save this look top right, Back bottom left.
- [ ] 02:00 Search orchestration: one search per missing slot, pool of three,
      settle-all result collection, cache per option revision and brief, per-slot
      skeleton, empty and failed states.
- [ ] 02:45 Product cards with source, price, rating or no rating, retrieval
      time, Value score with explanation and editable weights.
- [ ] 03:15 Save to wardrobe: restricted image fetch, private copy, canonical
      description, saved candidate status, duplicate protection.
- [ ] 03:45 Save this look: immutable snapshot plus avatar operation in one
      transaction; toast for saved and a second status for the avatar.
- [ ] 04:30 Saved looks D14 and M12: avatar first, preparing and failed states
      that still identify the outfit, retry without duplicating the look.
- [ ] 05:00 Share review D15, public page D16 and M13 with token-bound media,
      expiry chips, Turn off link confirmation (M14), revoked page.

### Owner 4: execution, capsules, preview

- [ ] 00:30 Operation runner contract with Owner 2 (Option A), activity
      endpoint for the bell panel.
- [ ] 01:15 Operation runner merged: start, dedupe by fingerprint, lease,
      result commit, stale rejection, status read.
- [ ] 01:45 Capsule wizard D10 and D11 (M09): five templates with photos,
      editable defaults, visual tiles, replace-template confirmation, draft per
      step.
- [ ] 02:45 Capsule generation from text and IDs only, required and excluded
      items, distinct outfits, addition only with three supported uses.
- [ ] 03:30 Capsule result D12 and M10: owned-only outfits, outfits with an
      addition, reuse card, save, preview and save-as-look actions.
- [ ] 04:00 Preview D13 and M11: category tabs, one item per slot, empty slots
      allowed, minimum one item, no consent checkbox, status timeline.
- [ ] 04:30 Avatar prompt builder: FASHION-PROMPT.md, canonical items, skin
      swatch ID and hex, undertone, body reference, fit, natural pose by
      outfit, illustrative limitation note.
- [ ] 05:00 Saved-look avatar consumer: reuse a matching preview, retry,
      independent failure.

### Whole team: product, pitch and demo

- [ ] 00:15 Dataset: collect the agreed WebP set (tops, bottoms, dresses,
      outerwear, shoes, bags, hats, accessories) with a `manifest.json` listing
      file, name, category and color per image; include film and Instagram-style
      inspiration images with usage rights noted.
- [ ] 03:00 One AI flowchart per owner (task, inputs, prompt files, schema,
      parallel calls, failure state) for the architecture slide.
- [ ] 04:30 Slides: problem with persona, solution with all features, live
      demo, architecture with Codex and the Muse and SerpAPI models plus data
      governance, business impact and model, roadmap, closing. Header with
      logo and app name left, event logo right; footer with slide number and
      title.
- [ ] 05:45 Demo script with Plan A (all four present), Plan B (one or two
      presenters) and Plan C (solo); list of tricky judge questions with
      answers; props.
- [ ] 06:15 Record the backup demo video on production with the demo
      workspace.

## 8. Demo safety checklist

- [ ] Demo workspace seeded with the four matching wardrobe items and at least
      ten more items across categories.
- [ ] Sample look path works without providers and is labeled as a sample.
- [ ] Provider failures show the unavailable state, never fake output.
- [ ] One saved look with a ready avatar and one active share link exist.
- [ ] Browser zoom at 100 percent, notifications off, second screen mirrored.
- [ ] Backup video and slides available offline.

## 9. Definition of done for any item

Matches its Figma frame at 1440 and 390 px; uses tokens and shared primitives;
has loading, empty, error and retry states; keeps state across navigation;
confirms destructive actions with the custom dialog; passes `pnpm check`;
merged through a reviewed PR; evidence row added to PROGRESS-NEW.md with the
exact checks run and anything not run.
