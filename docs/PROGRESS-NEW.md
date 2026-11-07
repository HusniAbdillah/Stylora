# Stylora shared progress reporting

This is the reporting template for four owners and their coding agents. It is
filled during the build, not a report in itself. Product requirements are in
[PRD.md](PRD.md),
assignments in [TASK.md](TASK.md), and contracts in [TDD.md](TDD.md).

## 1. Reporting rules

1. Start by reading the latest shared snapshot and dependencies below. Read the
   applicable task IDs and PRD requirements before editing.
2. Update only your owner section and shared rows you can substantiate. Preserve
   another owner's evidence; add a dated correction rather than silently
   rewriting it.
3. Distinguish code written, integration connected, tests passed, live provider
   verified and UI reviewed. None implies the others.
4. Every completion claim needs a file or commit reference and actual
   verification evidence. Record exact commands, environment and results. Never
   mark an unrun test passed.
5. Record whether data is real provider output, a synthetic fixture, manual
   content or sample content. A mock transport error is not a successful real
   inference.
6. Report contracts before changing shared schemas, dependencies, CSS or shell.
   Name the owner needed and the exact deliverable that unblocks you.
7. Preserve secrets: no keys, signed URLs, personal payloads or full sensitive
   provider logs.
8. Include cleanup and remaining work. Do not commit, push, deploy or modify
   hosted data merely to make a progress row look complete.

## 2. Status vocabulary

| Status                  | Meaning                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| Not assessed            | No owner has inspected this requirement for the reported source revision.        |
| Planned                 | Contract and acceptance criteria are understood; implementation not started.     |
| In progress             | Work is being implemented; list the incomplete behavior.                         |
| Implemented, unverified | Code exists but required checks or runtime evidence are missing.                 |
| Integration pending     | Owned code exists but another consumer or contract is not connected.             |
| Blocked                 | A specific external decision or dependency prevents the next step; name it.      |
| Verified                | Required acceptance evidence is recorded for the exact revision and environment. |
| Failed verification     | A required check failed; include failure and next action.                        |
| Not run                 | A check was intentionally skipped or unavailable; give the reason.               |

Do not use percentages as substitutes for task-level evidence. A verified local
check is not automatically a verified hosted flow.

## 3. Shared checkpoint snapshot

Copy and fill this block at each checkpoint; retain earlier dated checkpoints
below the latest one.

| Field                                     | Value                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Reported at and timezone                  | Not reported                                                            |
| Reporter and owner                        | Not assigned                                                            |
| Branch and inspected HEAD                 | Not reported                                                            |
| Base main revision                        | Not reported                                                            |
| Active requirement and task IDs           | Not reported                                                            |
| Working-tree changes outside this task    | Not assessed                                                            |
| Environment                               | Local app, hosted Supabase, disposable test database, or other; specify |
| Commit, push and deployment authorization | Not granted by this template                                            |
| Check restrictions                        | Record user instructions before running anything                        |
| Current shared integration blocker        | Not assessed                                                            |
| Next checkpoint                           | Not scheduled                                                           |

### Feature status board

| Flow                               | Accountable owner | PRD requirements | Status       | Evidence or blocker |
| ---------------------------------- | ----------------- | ---------------- | ------------ | ------------------- |
| Canonical items and preferences    | 1                 | R07–R09, R33–R36 | Not assessed | —                   |
| Shared shell and durable drafts    | 1 with 2          | R01–R03, R10–R11 | Not assessed | —                   |
| Landing                            | 2                 | R12–R14          | Not assessed | —                   |
| Upload and early parallel analysis | 2                 | R15–R17          | Not assessed | —                   |
| Streaming review and corrections   | 2                 | R18–R21          | Not assessed | —                   |
| Credible wardrobe matching         | 2                 | R22–R24          | Not assessed | —                   |
| Three directions and regeneration  | 2                 | R25–R27          | Not assessed | —                   |
| Integrated shopping and value      | 3                 | R28–R32          | Not assessed | —                   |
| Capsule wizard and combinations    | 4                 | R37–R40          | Not assessed | —                   |
| Category-based preview             | 4                 | R41–R43          | Not assessed | —                   |
| Save with automatic avatar         | 3 with 4          | R44              | Not assessed | —                   |
| Image-led public share             | 3                 | R45              | Not assessed | —                   |
| Durable worker and recovery        | 4 with 2          | R01, R04–R06     | Not assessed | —                   |

## 4. Owner 1 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: canonical items, preference mapping, candidate ownership,
  migrations and types; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumers integrated: Owners 2, 3 and 4; not assessed.
- Verification evidence: Not run.
- Hosted schema changes and authorization: None reported.
- Unresolved work and next concrete action: Not reported.

## 5. Owner 2 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: upload, draft, streaming events, match and three-option
  payload; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumer integration: Owner 1 inventory and preferences; Owner 3 selected
  detail; Owner 4 worker; not assessed.
- Verification evidence: Not run.
- Real Muse evidence and input provenance: Not verified.
- Unresolved work and next concrete action: Not reported.

## 6. Owner 3 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: search, selection, candidate import, immutable save and
  public media; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumer integration: Owner 2 options; Owner 1 wardrobe import; Owner 4
  avatar; not assessed.
- Verification evidence: Not run.
- Real SerpAPI and share-revocation evidence: Not verified.
- Unresolved work and next concrete action: Not reported.

## 7. Owner 4 report

- Reporter and timestamp: Not reported.
- Source revision and task IDs: Not reported.
- Contract published: worker execution, capsule text inputs, category selection
  and avatar result; not assessed.
- Behavior implemented: Not reported.
- Files changed: Not reported.
- Consumer integration: Owner 1 schema; Owner 2 operation protocol; Owner 3 save
  outbox and media; not assessed.
- Verification evidence: Not run.
- Real text and image provider evidence: Not verified.
- Unresolved work and next concrete action: Not reported.

## 8. Task evidence ledger

Add one row per meaningful task, not one vague row for an entire owner.

| Task ID   | Requirement IDs | Expected behavior | Implemented files or commit | Contract version | Status       | Evidence reference | Next action                   |
| --------- | --------------- | ----------------- | --------------------------- | ---------------- | ------------ | ------------------ | ----------------------------- |
| To assign | To assign       | To specify        | None reported               | Not reported     | Not assessed | None               | Inspect and define acceptance |

## 9. Cross-owner integration ledger

| Producer → consumer | Contract                           | Input version | Consumer acknowledgment | Integrated revision | Verification | Blocker and owner |
| ------------------- | ---------------------------------- | ------------- | ----------------------- | ------------------- | ------------ | ----------------- |
| 1 → 2, 3, 4         | Canonical wardrobe and preferences | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 2 → 3               | Options, slots and revisions       | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 2 ↔ 4               | Job and replay protocol            | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 3 → 1               | Product-to-wardrobe candidate      | Not reported  | Pending                 | None                | Not run      | Not assessed      |
| 3 ↔ 4               | Save snapshot and avatar media     | Not reported  | Pending                 | None                | Not run      | Not assessed      |

## 10. Verification record template

### Check identifier: replace with a stable ID

- Requirement and task IDs:
- Date, reporter, branch and commit:
- Environment and data scope:
- Exact command or manual steps:
- Expected result:
- Actual result and exit code:
- Status: Passed, Failed, Not run, or Blocked.
- Data provenance: Live provider, synthetic fixture, manual, or sample.
- Provider and model; prompt and item schema versions:
- Safe operation or fixture IDs; no secrets or signed URLs:
- Evidence artifact or log location:
- Cleanup attempted and confirmed:
- Remaining limitation and next action:

### Connected-flow ledger

| Scenario               | Required checkpoints                                                                           | Status  | Evidence |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------- | -------- |
| Create to saved look   | Upload → streamed review → correction → match → three directions → integrated shopping → save  | Not run | None     |
| Navigation restoration | Leave each feature, return, reload and switch options without losing state                     | Not run | None     |
| AI integrity           | Real output, valid IDs, honest empty wardrobe, strict sport-versus-formal rejection            | Not run | None     |
| Capsule                | Five templates → editable wizard → multiple combinations → reuse explanation → save or preview | Not run | None     |
| Preview and avatar     | Category selection → profile-aware image → save → media reload                                 | Not run | None     |
| Public share           | Approved media → public grid → expiry or revoke → access denied                                | Not run | None     |
| Recovery               | Timeout, partial stream, stale completion, duplicate enqueue, worker restart and retry         | Not run | None     |

## 11. Decision and blocker log

| ID        | Decision needed or blocker         | Impact                | Accountable owner | Proposed resolution | Status | Evidence or approval |
| --------- | ---------------------------------- | --------------------- | ----------------- | ------------------- | ------ | -------------------- |
| To assign | Specify the exact missing decision | Name blocked behavior | 1–4               | Concrete next step  | Open   | None                 |

## 12. Final handoff template

- Delivered behavior, with requirement IDs:
- Files and contracts changed:
- Integration completed and still pending:
- Checks passed with evidence:
- Checks failed:
- Checks not run and why:
- Real-provider, database and storage status:
- User-visible limitations:
- Test-data cleanup status:
- Migration, deployment or authorization still needed:
- Next owner and exact next action:
- Commit and push state:

A report is complete when another owner can resume from it without guessing
which data, code revision or provider behavior was verified.
