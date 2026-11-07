# Workspace feedback audit

7 November 2026. Owner 1, O1.5 with the user's explicit request for feedback across all features. Lane B. Source review started at `f634525` and was reconciled with `origin/main` at `1d0afb3` before delivery. This is a source and UI feedback audit; it does not certify live provider output, hosted policies, or deployment health.

## Repository map and findings

| Area | Source and role | Feedback decision |
| --- | --- | --- |
| Product contracts | [PRD](PRD.md), [TDD](TDD.md), [DESIGN](DESIGN.md), [TASK](TASK.md), [WORKFLOW](WORKFLOW.md) | Keep required scope, existing navigation and explicit incomplete states. DESIGN section 14 already specifies toast plus Activity. |
| Application routes | [Workspace routes](../src/app/(workspace)), [root layout](../src/app/layout.tsx), [public sharing](../src/app/shared) | Mount one notification viewport above route changes. Hide workspace notifications on landing, sample and public share pages. |
| Shared shell | [Owner workspace](../src/components/shell/owner-workspace.tsx), [navigation](../src/components/shell/workspace-navigation.tsx) | Reuse the existing five-second Activity refresh. Merge operation and action history without duplicating a task in the bell panel. |
| Shared UI | [Primitives](../src/components/ui/primitives.tsx), [tokens](../src/app/globals.css), [component stories](../src/components/ui) | Extend the existing Toast. Reuse Paper, Ink, Secondary, Crimson, status colors, radii, icons and motion tokens. Add no UI library. |
| Create | [Create session](../src/features/inspiration/create-session.ts), [client contracts](../src/features/inspiration/client-contract.ts), [matching](../src/features/matching), [outfits](../src/features/outfits) | Upload feedback ends after verification. Description, confidence, matching, ideas and regeneration use their persisted operation states. |
| Wardrobe | [Client](../src/features/wardrobe/client.ts), [intake](../src/features/wardrobe/wardrobe-intake-flow.tsx), [item detail](../src/features/wardrobe/wardrobe-item-detail-flow.tsx) | Track verified upload, confirmation and mutations. Keep draft autosave success quiet; retain actionable failures. Description remains a separate operation. |
| Preferences and Profile | [Settings contract](../src/features/preferences/client-contract.ts), [draft handling](../src/features/preferences/live-settings-draft.ts), [Profile](../src/features/profile) | Announce schema-validated server saves. Do not preserve the older browser-only success claims after integrating current main. |
| Marketplace | [Outfit page](../src/features/products/outfit-page.tsx), [queries](../src/features/products/queries.ts), [candidate import](../src/features/products/image-import.ts) | Separate concurrent slot requests. Candidate persistence with a failed image needs attention, even when HTTP succeeds. Empty search results are not provider failures. |
| Saved looks and sharing | [Saved workspace](../src/features/decisions/saved-workspace.tsx), [share manager](../src/features/sharing/share-manager.tsx), [share views](../src/features/sharing/share-views.tsx) | Announce save, delete, retry request, link creation, revocation and clipboard results. Never copy a share URL into notification history. |
| Capsules | [Wizard](../src/features/capsules/studio-draft.tsx), [results](../src/features/capsules/result-screen.tsx), [collection](../src/features/capsules/collection-screen.tsx) | Keep autosave quiet, generation visible, and deletion failures recoverable. Saving a capsule outfit does not mean its avatar image is ready. |
| Preview and avatars | [Preview client](../src/features/preview/preview-client.tsx), [studio save](../src/features/outfits/studio-save-button.tsx), [operation client](../src/features/operations/client.ts) | Selection persistence, immutable save and image generation retain separate outcomes. A disconnected request may still have executed, so ask users to check status before retrying. |
| AI and operations | [Operation schema](../src/features/operations/schema.ts), [dispatch](../src/features/operations/dispatch.ts), [fashion prompts](../src/prompts/fashion.ts) | Project existing statuses; do not invent progress percentages, results or a background executor. This change does not modify prompts or model calls. |
| Persistence and verification | [Supabase boundary](../src/lib/supabase), [migrations](../supabase/migrations), [policy tests](../supabase/tests), [generated types](../src/types/database.ts), [scripts](../scripts) | Reuse existing APIs and write gates. No migration, generated-type edit, hosted write, seed, deployment or paid provider call is part of this task. Existing SQL tests are evidence of test coverage, not evidence they ran in this audit. |
| Assets and visual catalog | [Assets](../assets), [public design assets](../public/design), [Storybook](../.storybook) | Reuse the existing SVG icons. Fixtures remain explicitly labeled and do not represent live fashion results. |

The live Figma file was read through its metadata and the Activity frame `270:2437` under D17. Its Paper surface, restrained icons, readable supporting text and quiet hierarchy match the shared primitives. The file currently names its pages `01 Brand guidelines`, `02 Design desktop` and `03 Design mobile`; the older page numbering in DESIGN remains a documentation mismatch. No governing specification was rewritten for this task.

## Shared feedback contract

[The feedback store](../src/lib/feedback/store.ts) accepts an operation or action ID, label, safe detail, state, optional internal destination and optional retry callback. IDs identify existing tasks or local notifications; they never become invented wardrobe or provider IDs. The store is browser memory, survives in-app navigation and does not write payloads or signed URLs to browser storage. It retains running tasks plus the most recent 50 settled records.

[Operation reconciliation](../src/features/operations/notifications.ts) consumes the Activity API's already-validated DTO. It rejects older timestamps, updates the same record across stages, and keeps historical completions quiet on the first load. Dismissing a toast does not cancel a task or delete its Activity entry. A later real stage transition can announce an update.

[Request feedback](../src/lib/feedback/request.ts) wraps the application's existing request boundaries. The Settings boundary announces success only after its supplied Zod schema passes. Independent shopping calls have distinct local IDs. This is explicit integration at application boundaries; global `fetch`, unhandled exceptions and unrelated browser events are not intercepted.

## State and presentation policy

| Case | Result |
| --- | --- |
| Queued | Label as queued; do not claim execution has started. |
| Running | Persistent task toast with refresh icon and real status. |
| Partial | State that final validation is pending; no completion check mark. |
| Completed | Announce the completed task. Success cards dismiss after eight visible seconds. |
| Failed | Keep the error available until dismissed; retain inline recovery and Activity history. |
| Cancelled | Say cancelled, without claiming a completed result. |
| Superseded | Explain that newer inputs replaced this revision. |
| Retry accepted | Announce the request, then rely on task status. Never equate acceptance with completion. |
| Save succeeded, image failed | Keep save success. Report image failure independently. |
| Candidate saved, image import failed | Explicitly retain the candidate and offer image retry through its feature. |
| No products found | Show an empty-result outcome and suggest adjusting the search. |
| Revision conflict or disabled writes | Preserve the draft and the server's safe recovery message; no automatic mutation replay. |
| Network interruption | Do not assume a mutation failed to reach the server; check task state before retrying. |
| Initial historical completion | Available in Activity, without a new success toast. |
| Repeated polling of the same stage | No duplicate or repeatedly announced toast. |
| Navigation, filters and local selection | Keep normal inline state. No toast for every click or keystroke. |
| Public share, landing or sample page | Do not display the workspace's notification stream. |

The viewport sits at bottom right with safe-area spacing, a bounded scroll area and a pointer-transparent surround. Long labels wrap. Dismiss and retry controls have 44 px targets. Hover, focus and hidden-page time pause or extend success dismissal. Status announcements do not steal focus. Reduced motion removes entry movement and the rotating indicator. Existing destructive confirmation dialogs remain authoritative.

Retry in the Activity panel retains Create's existing handling. Capsule and saved-avatar retries first read the current operation and require explicit retryable metadata, then use the existing retry and execution endpoints. Unsupported or changed contexts link back to the feature for review. Read-only workspaces do not receive a new mutation callback.

## Remaining limits and priorities

1. **Background execution is still Option A.** Notifications observe execution; they do not make browser-initiated requests durable after browser or server interruption. Leases and existing resume behavior still govern recovery. A deployed consumer is separate work.
2. **Activity is bounded.** The existing endpoint returns up to 50 recent operations. Extremely old tasks displaced by a busy workspace may need their feature's direct status view. This task does not add full-history pagination or claim complete hosted history.
3. **Live integration is separate evidence.** Unit tests and explicit Storybook fixtures do not prove a live upload, provider completion, share revocation, Storage policy, or end-to-end save. None of those provider or hosted mutation checks was run here.
4. **Keep ownership of recovery local.** Field validation, stale revision review, manual description fallback and destructive confirmation belong in their feature. Toasts provide visibility, not a replacement form or dialog system.
5. **Keep the integration seam current.** New mutation endpoints should declare their message in the request feedback mapping or use `withFeedback` around the schema-validating boundary. New operation kinds must extend the existing operation schema and label mapping together.

## Verification

- Isolated worktree and branch: `o1/progress-feedback`; no changes applied to another session's checkout.
- `pnpm install --frozen-lockfile --offline` first failed because the isolated store lacked a tarball. The approved `pnpm install --frozen-lockfile` completed without changing dependencies or the lockfile.
- Focused operation and feedback tests: 10 passed.
- `make test` after reconciliation with main: 268 passed, 2 skipped by the existing suite, 43 test files passed and 1 skipped. Synthetic HTTP responses and operation DTOs only; no provider calls.
- `git diff --check`: passed at the implementation checkpoint.
- Initial `tsc --noEmit` on the older base found two pre-existing wardrobe type mismatches. Final lint and type checks are recorded in [PROGRESS-NEW.md](PROGRESS-NEW.md) after the main reconciliation.
- UI fixture: [notification lifecycle story](../src/components/ui/notifications.stories.tsx). Failure and Retry states were exercised in the integrated browser. Final responsive and screenshot evidence is recorded in the progress report.
- Not run: production build locally, hosted database tests, seeding, paid provider calls and deployment. CI remains the full build gate.
