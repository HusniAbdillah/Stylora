## Summary

<!-- What changed and why, in two or three sentences. -->

## Task and design

- Task and requirement IDs:
- Figma frame IDs (for example D04, M04):
- Lane (see docs/WORKFLOW.md section 10.6): A / B

## Checks

<!-- List the commands actually run. Write "not run" and the reason for the rest. -->

- [ ] `make fast` once before opening this pull request
- [ ] `make test` (only if the diff touches code with existing tests)
- [ ] CI runs `pnpm check` and `pnpm build` on this pull request
- [ ] Changed flow clicked once on preview or `make dev` (UI changes)

Not run and why:

## Self-review

- [ ] Only files for this task changed
- [ ] No secrets, signed URLs or personal payloads
- [ ] Reads and writes scoped to server-side `STYLORA_WORKSPACE_ID`; Zod validation
- [ ] No invented IDs or model output; failures show an unavailable state
- [ ] `docs/PROGRESS-NEW.md` row added with actual evidence

## Screenshots or preview link

## Limits and follow-up
