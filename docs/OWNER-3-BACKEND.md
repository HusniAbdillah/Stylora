# Owner 3 backend handoff

Owner 3 implements products, decisions and public sharing. The existing hosted
schema and generated types are the persistence contract. No image model is
implemented by this slice.

## Saved overview image contract

Saving uses `save_look_snapshot`, which atomically creates the immutable outfit,
a `saved_avatar` workflow operation and a `saved_look_media` row. Saving succeeds
independently of image completion. The image generator is owned by Owner 4.

The generator claims its operation under the same workspace and reads the saved
items and preference snapshot. It writes a verified PNG to the private previews
bucket using the workspace/asset/random path convention. Once the asset is ready,
it records the output asset on the matching media row and transitions the media
and operation to succeeded. Failed generation records a safe failure; it never
deletes the saved outfit. Respect operation leases, attempts and supersession.

Frontend cards render a placeholder while media is queued or running, a retry
state when failed, and the transient authorized image URL when succeeded. A
missing URL is not replaced with a fabricated image. Keep title and outfit items
visible in every state. Public media must go through the token-checked sharing
endpoint instead of reusing a private signed image URL.

## Parallel implementation

Products, decisions and sharing have separate worktrees and feature-owned route
handlers. The coordinator owns shared HTTP responses, integration and delivery.
No subagent changes the applied baseline, package configuration or another
owner's feature. Search prefetch and image execution connect to Owners 2 and 4
through their operation contracts; a persisted job alone is not an executor.

Mutation requests use JSON, strict schemas, the configured server workspace,
expected revisions and idempotency where required. HTTP responses use `data`
or a safe `error` object; responses are not cached.

## Figma response mapping

Reviewed desktop canvas `250:395` and high-fidelity contexts/screenshots for
`263:764` (D06), `269:1908` (D14), `282:3441` (D27), `270:2025` (D15) and
`269:2113` (D16) in the Stylora Design System.

- D06 needs stable per-option choices, per-slot search state, product source,
  retrieval time, known offer fields, adjustable score factors and saved-candidate
  state. Reopening a tab reads cached results rather than charging a new search.
- D14 needs All, Shared and Preparing filters/counts, item thumbnails, saved
  timestamps and truthful media state. Preparing and failed cards keep the outfit
  visible; only failed eligible media offers retry.
- D27 reads the immutable composition and ownership-at-save, media and active
  share expiry. Preview and capsule navigation pass source references to the
  owning feature. Image generation/regeneration is a separate consumer contract.
- D15 uses an explicit public preview, catchphrase and 24/168/720-hour expiry
  choices. Public approval never discloses preference values or the wardrobe.
- D16 leads with approved overview imagery and a compact item grid. Token-checked
  image endpoints serve authorized snapshot media with no-store. Asset IDs and
  Storage paths remain internal.

Design images are illustrative references. No Figma mock asset is substituted
for a runtime wardrobe image, provider result or generated overview.
