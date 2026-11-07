# Stylora agent playbook for Codex

How four owners run four Codex sessions in parallel for seven hours and still
merge clean, fast code. It complements [WORKFLOW.md](WORKFLOW.md) (process and
delivery lane), [TASK.md](TASK.md) (ownership) and [AGENTS.md](../AGENTS.md)
(binding rules). If they differ, they win.

## 1. Why this is fast

1. **Contracts first, then slices.** Owner 1 publishes tokens, primitives, Zod
   contracts and the baseline migration by 00:40. After that each owner ships
   whole vertical slices inside their own folders, so edits rarely overlap.
2. **File ownership instead of coordination.** Conflicts come from shared files,
   not from features. Shared files have one owner and a Lane B pull request.
3. **Small branches, early merges.** Up to 90 minutes per branch, near 400 lines
   per pull request, squash merge.
4. **CI is the gate, not the agent.** No checks per commit, one `make fast`
   before the pull request, CI runs check and build, auto-merge does the waiting.
5. **Read less.** The `stylora-start-task` skill routes each task to the few spec
   sections it needs. Nobody reads `FASHION.md` end to end.
6. **Never idle.** A blocked agent builds the unblocked part and takes the next
   TODO item instead of waiting.

## 2. Codex setup, first 15 minutes per laptop

1. Clone, `pnpm install --frozen-lockfile`, `make env`, fill `.env.local` with
   your own workspace ID (`dev-owner-N`). Use `make help` to see shortcuts.
2. Open the repo in Codex. Codex reads `AGENTS.md` automatically and discovers
   skills in `.agents/skills`. Ask it to list the Stylora skills to confirm all
   thirteen appear.
3. Set Codex's approval mode so it can run `git`, `gh`, `pnpm` and `make` in the
   workspace without a prompt per command, while keeping writes outside the repo
   and unknown network access gated. Check the current option names in the Codex
   documentation; they change between releases.
4. `gh auth login` once. Confirm `gh pr list` works.
5. For parallel work create a worktree per task: `make wt name=oN/<slug>`, run
   Codex from inside that folder.

## 3. Skills

Project skills live in `.agents/skills/`. The `stylora-*` skills are authored for
this repository; the others are reviewed third-party copies with source, commit,
license and local patches recorded in `.agents/skills/THIRD-PARTY.md`. Skills add
procedure, not authority; `AGENTS.md` stays the source of rules.

| Skill                                                              | Use it when                                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `stylora-start-task`                                               | Beginning any task: routes docs, checks blockers, sets up the worktree       |
| `stylora-feature-slice`                                            | Writing routes, queries, mutations, schemas, storage code                    |
| `stylora-ai-task`                                                  | Any model call: prompt loading, validation, operations, honest failure       |
| `stylora-ui-from-figma`                                            | Building a screen from a frame with tokens and primitives                    |
| `stylora-antislop`                                                 | Before every pull request and when writing copy or reports                   |
| `stylora-ship`                                                     | Commit, push, pull request, auto-merge, revert                               |
| `stylora-parallel`                                                 | Several sessions at once, worktrees, ordering, blocked work                  |
| `antislop`, `antislop-ui`, `antislop-copywriting`, `antislop-code` | Deeper anti-slop passes on screens, text and comments (third party, patched) |
| `vercel-react-best-practices`, `vercel-composition-patterns`       | React and Next.js performance and component design (third party)             |

`AGENTS.md` carries the trigger rules so Codex loads the right skill without
being asked. Edit a skill in its folder, commit it through a Lane B pull request,
and tell the team. Do not install third-party skills without a review of their
text; they run with the agent's permissions.

## 4. The loop for one task

1. Pick the next unblocked item in your TODO (`stylora-start-task`).
2. `make wt name=oN/<slug>`, read the routed sections, state a five-line plan.
3. Build the slice (`stylora-feature-slice`, `stylora-ai-task`,
   `stylora-ui-from-figma`). Commit every 15 to 30 minutes.
4. `stylora-antislop` on the diff, `make fast` once.
5. Add the `docs/PROGRESS-NEW.md` row, push, open the pull request.
6. Lane A: enable auto-merge and start the next task. Lane B: stop and ping the
   reviewer.
7. After merge, `make wt-rm name=oN/<slug>`.

## 5. Copy-paste kickoff prompt

Give each session this, filled in:

```
You are Owner <N> on Stylora. Task: <ID and title from docs/TODO.md>.
Use the stylora-start-task skill first, then build, then stylora-antislop and
stylora-ship. Work in a worktree on branch o<N>/<slug>. Stay inside my folders.
Deliver in small commits, open a pull request, and for Lane A enable auto-merge.
Report commits, PR link, checks run and not run, and what is left.
```

For a second parallel session add: "Another session is working on <other task>
in <other folder>. Do not touch it."

## 6. What runs at the same time

| Window      | Owner 1                    | Owner 2                 | Owner 3                  | Owner 4                  |
| ----------- | -------------------------- | ----------------------- | ------------------------ | ------------------------ |
| 00:00-00:40 | Tokens, primitives, schema | Streaming contract      | Selected and share types | Runner contract          |
| 00:40-02:00 | Shell, wardrobe grid       | Create route, upload    | Details page, search     | Runner, capsule wizard   |
| 02:00-04:00 | Intake, candidates, prefs  | Review, matching, ideas | Products, save, avatar   | Capsule results, preview |
| 04:00-05:15 | Prefs adapter, profile     | Landing, empty states   | Saved looks, sharing     | Avatar consumer, preview |
| 05:15-06:00 | Integration fixes only     | Integration fixes only  | Integration fixes only   | Integration fixes only   |

Critical path: contracts and baseline migration (Owner 1), then the operation
runner (Owners 2 and 4), then Create to save to avatar. Protect those first;
they unblock everyone else.

## 7. Review and merge rhythm

- Lane A merges itself through CI. Humans skim merged pull requests in the 15
  minutes before each merge window and flag problems in chat. A bad merge is
  fixed forward or reverted with a revert pull request.
- Lane B waits for a human. Reviewer rotation: Owner 1 reviews 2, 2 reviews 3,
  3 reviews 4, 4 reviews 1. Owner 1 approves shared files. Reviewers answer within
  10 minutes; ping in chat if not. Do not sit idle while waiting; take the next
  task.
- Use the review skill your tools offer on Lane B pull requests only, one pass,
  focused on correctness and workspace scoping.

## 8. Time boxes

- A task running past 1.5 times its TODO estimate: stop, report the blocker and
  the smallest slice that still meets the PRD requirement. The scope decision is
  the owner's and the team's; the agent never drops a required feature silently.
- Polishing ends when the frame comparison at 1440 and 390 px is close. No pixel
  chasing.
- Two failed fixes for the same CI error: stop and ask.

## 9. Checkpoint ritual, 5 minutes at 02:00, 04:00 and 05:30

Each owner pastes their current `docs/PROGRESS-NEW.md` snapshot. The team checks
three things only: what is merged, what is blocked and who unblocks it, and what
evidence from a real provider exists. Then everyone goes back to work.

## 10. Common failures

| Symptom                                | Fix                                                                   |
| -------------------------------------- | --------------------------------------------------------------------- |
| Two agents edit `package.json` or CSS  | Stop. Owner 1 makes the change in a Lane B pull request.              |
| Agent keeps rereading specs            | Point it at `stylora-start-task`; give the task ID and frame IDs.     |
| Agent adds a service layer or library  | Reject in review; see `stylora-feature-slice` and `stylora-antislop`. |
| CI red after rebase                    | Read the failing step, fix once, then ask. Do not skip the check.     |
| Provider quota burning                 | Cache by fingerprint; stop live calls; use a labeled sample.          |
| Pull request over 400 lines            | Split by feature folder and merge in order.                           |
| Agent claims verified without evidence | Reject the row; require the command, environment and result.          |
