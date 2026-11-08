# AI reliability audit, 8 November 2026

Branch: `o4/ai-reliability-audit`, based on `ba4252d`. Scope: Owner 4 operations
and the related Create, wardrobe and page-loading failures authorized by the
user. Delivery is one pull request. No production deployment or hosted schema
change is included.

## Causes and changes

| Finding | Change |
| --- | --- |
| Queued rows depended on another browser execution request. Closing the browser left work unclaimed. | A separately running worker scans persisted jobs. Worker-mode routes acknowledge with 202, and the browser only polls. Inline remains the compatibility default. |
| Create's 900-second lease exceeded the 300-second route budget. Capacity waits consumed up to 120 seconds before model work. | A 280-second lease, shared 240-second deadline, abort propagation and short reservation wait bound execution and recovery. |
| Missing-piece output expanded into a large canonical garment object for every option. IDs and option types were constrained too late. | Compact category-specific wire schemas constrain IDs, directions and counts before inference. Canonical output and composition/evidence checks remain mandatory. |
| Capsule collapsed JSON, refusal, truncation, schema and domain errors into `OPENAI_INVALID_OUTPUT`. | Safe failure codes and bounded field paths identify the failing stage. A captured policy permits one deterministic correction, with no guessed IDs or silent repair. |
| Retry and generation settings could drift from the original request. | Capsule captures its context and policy. Saved avatars retain a durable render-context event across retries, including settings and visual preferences. |
| A real saved-avatar execution attempted to update immutable operation input. PostgreSQL rejected it before rendering. | Capture render context separately. Preserve the database's immutable-input trigger and use attempt, fingerprint, lease and cancellation fences. |
| A late Create allocation could execute after changing or discarding a draft. | Fence allocation, observation and execution by captured draft identity. Check active draft state before provider work and commit. |
| Preview collection reads signed assets individually. Active polls rebuilt full image context and signed URLs. | Validated batch signing and a lightweight polling DTO retain the previous image until a terminal transition requires a full refresh. |
| Wardrobe collection serialized canonical provenance for every card. | A separate collection DTO contains card fields and equivalent search text. Item detail and the canonical API retain complete evidence. |
| Landing awaited its database-backed demo before showing the page. | Stream the demo inside Suspense while rendering the hero and navigation immediately. |
| Slow Supabase requests lacked a general network deadline. | Server-side database and Storage transport now has a 30-second bound while preserving caller cancellation. |

## Local provider evaluation

The local Next.js app and separate worker used hosted `dev-owner-4`. The worker
was fenced to an external allowlist of run-owned subjects. Test images came
from the repository's labeled sample assets. Seven additional sample wardrobe
items were created for this run. Preferences and pre-existing wardrobe rows
were not edited.

Each paid job below finished without a browser execution POST after allocation.
Durations are persisted operation elapsed times, including queue and database
work. They are observations from this run, not a production benchmark.

| Flow | Result | Elapsed |
| --- | --- | --- |
| Inspiration description | Five validated garments and persisted provisional events | 29.560 s |
| Independent confidence review | Saved successfully | 14.515 s |
| Wardrobe match | Saved validated matching evidence | 15.910 s |
| Outfit ideas | Three directions committed | 33.319 s |
| Regenerate one direction | Combined inventory request accepted and replaced one direction | 18.812 s |
| Wardrobe photo description | One proposal, occasion omitted | 15.136 s |
| Capsule generation | Three complete outfits | 18.538 s |
| Capsule with request ledger | Three outfits, one reserved and recorded request | 21.091 s |
| Preview image | Verified private PNG | 29.198 s |
| Save Preview | Same completed asset reused, no render | 0.045 s |
| Saved Capsule avatar before fix | Failed before the provider on immutable-input update | 5.457 s |
| New saved-avatar request after fix | Verified image attached successfully | 32.190 s |

Text used `gpt-6-luna`; rendered images used `gpt-image-1.5`, medium quality.
Six Create/wardrobe requests and the later Capsule request were counted. The
first Capsule ran before its new ledger was integrated and could use one or
two requests. Total text usage was therefore eight or nine requests, within
the twelve-request evaluation cap. Two image requests were made, within the
two-image cap. Preview save reused its asset; the reproduced avatar failure
occurred before provider execution. No marketplace provider search ran because
this generated composition had no missing slots. Marketplace provider/score
behavior remains covered by offline tests; it was not a live catalog test.

A fresh worker process also retired an explicitly obsolete Create capture and
terminalized an exhausted expired Capsule lease without provider calls. The
first cold-development readiness probe timed out; bounded startup retries now
handle that case. Unauthorized worker access returned 401, and an operation
from another workspace returned 404 through the local API.

## Page measurements and UI checks

For the same 52-item test inventory, Wardrobe HTML fell from 476,426 to 153,073
bytes, about 68 percent. Active Preview polling returned 269 bytes rather than
the full 1,224-byte image-status response. One paired local observation was
350 ms for lightweight polling and 1,298 ms for full status. Later timings
varied during development compilation. Core Web Vitals and production latency
were not measured, and these numbers do not establish a production speedup.

Desktop navigation opened Capsule results. The mobile result view at 390 by
844 displayed the three real outfits and had no horizontal overflow. The
temporary viewport override was reset. A loopback development-origin issue
initially prevented hydration at `127.0.0.1`; that explicit local hostname is
now allowed without adding a wildcard.

## Remaining operational limits

- Production needs an independently supervised worker before enabling worker
  mode. This change only ran the executor locally. A configuration probe is not
  a liveness heartbeat; monitor queued age and expired leases.
- Run one worker per workspace. Capsule has a durable three-request operation
  ledger, but no database-wide text semaphore across multiple worker processes.
- Create checks draft state immediately before commit. A strict concurrent
  discard-versus-commit guarantee still needs an active-draft check inside the
  existing `finish_create_operation` database transaction. No migration was
  silently applied for that follow-up.
- Recovery after an ambiguous paid-provider interruption cannot guarantee
  exactly-once billing. No paid request was deliberately killed in this run.
- The avatar was inspected for composition and visible garment detail. This run
  did not repeat the earlier cross-preference visual comparison or measure
  physical fit accuracy.

See [AI-WORKER.md](AI-WORKER.md) for setup and recovery. Validation commands,
cleanup and delivery state are recorded in [PROGRESS-NEW.md](PROGRESS-NEW.md).
