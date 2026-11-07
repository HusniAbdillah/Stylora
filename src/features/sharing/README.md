# Sharing

Owns review, publication, expiry, revocation and token-checked projections of approved saved-look media.

`POST /api/saved-looks/[id]/shares` accepts `catchphrase`, `expiresInHours`
(1–720, default 168), and explicitly reviewed `approvedMediaIds`. It copies the
saved snapshot's title and item display fields, stores a SHA-256 token digest,
and returns the raw token and relative public path once. Listing links never
returns the token or digest. All management stays in the server-configured
shared workspace and mutations require the shared write flag.

A link may contain no approved avatar. Its public media status is
`not_included`; it does not promise that generation is running. Publication is
immutable, so approving a later image creates a new link. Catchphrases are user
text and this slice never calls an image or language model.

Public image URLs use ordinal indexes, not database IDs. Avatar bytes require
an approved, succeeded media row from the exact saved look and a ready preview
asset. Item thumbnails resolve only captured ready wardrobe or preview asset
references from the immutable snapshot. Product URLs are not fetched by this
proxy. Every image request rechecks token expiry and revocation, including after
download, and streams the bytes with `no-store`.
