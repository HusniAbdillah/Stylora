# Owner 3 frontend handoff

## Routes and design

| Route                                   | Figma desktop  | Figma mobile      |
| --------------------------------------- | -------------- | ----------------- |
| `/looks/[lookId]?option_id=...`         | D06 `263:764`  | M06 `272:335`     |
| `/saved-looks?filter=all`               | D14 `269:1908` | M12 `274:379`     |
| `/saved-looks/[id]`                     | D27 `282:3441` | M18 `284:572`     |
| Share review from saved cards or detail | D15 `270:2025` | Responsive dialog |
| `/shared/[token]`                       | D16 `269:2113` | M13 `274:431`     |
| Expired, revoked or invalid share       | D28 `282:3622` | M22 `285:760`     |

The current Figma file labels these canvases `02 Design desktop` and `03 Design
mobile`. The verified frame IDs identify the visual references despite older
page names in the repository documentation. Existing UI components, local brand
assets, fonts, tokens and shell are reused; catalog and wardrobe images remain
runtime data. Figma imagery is never substituted for provider or generated data.

## State and behavior

Outfit options retain separate selections, cached searches and validated draft
IDs. Value weights are recomputed locally. Automatic missing-slot requests use a
bounded pool; reads of running searches do not start more provider work. Request
and revision guards reject obsolete results. A previously selected item becoming
unavailable remains visible and requires review rather than silent substitution.

Saving persists the selected composition and navigates to saved detail. The
overview can remain queued or fail independently. Collection filters and cursor
are in the URL, counts come from the server and detail return links retain the
collection view. Media status refreshes are bounded reads; they do not execute
image jobs. Write-disabled workspaces retain browse and review behavior.

Share review loads the real immutable snapshot and link metadata. Users approve
ready overview media explicitly. A link without an approved overview shares the
item composition and never silently publishes a later image. Raw tokens exist
only in the current creation session; reopening a review shows metadata and can
create another link. Revocation uses the accessible confirmation dialog. Public
pages use token-checked image endpoints and render unavailable links separately
from temporary errors.

## Remaining cross-owner integration

Owner 2 owns Upload, Review pieces, Wardrobe match and Outfit ideas at
`/create/[lookId]?step=...`. The detail route redirects earlier-step links there,
preserving the look reference and a valid draft parameter. Committed option IDs
open `/looks/[lookId]?option_id=...`; historical and older-revision options are
excluded from the active detail picker.

Latest main `2b88681` supplies the saved-avatar executor and the saved snapshot
preview source adapter. Saved detail now opens `/preview?savedLookId=...` so the
owning feature restores the exact saved source. Direct saved-image regeneration
and saved-to-capsule source conversion remain unavailable until their contracts
are published. Failed-image retry uses the existing retry contract and never
doubles as successful-image regeneration.

The backend contracts and provider execution limits remain documented in
[OWNER-3-BACKEND.md](OWNER-3-BACKEND.md).
