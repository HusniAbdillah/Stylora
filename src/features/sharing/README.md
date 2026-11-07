# Sharing

Owns review, publication, expiry, revocation and token-checked projections of approved saved-look media.

`POST /api/saved-looks/[id]/shares` accepts an editable public look description
in `catchphrase` and explicitly reviewed `approvedMediaIds`. New links have no
automatic expiry and remain active until revoked. The optional legacy
`expiresInHours` input is validated but ignored; existing finite links retain
their expiry. It copies the
saved snapshot's title and item display fields, stores a SHA-256 token digest,
and returns the raw token and relative public path once. Listing links never
returns the token or digest. All management stays in the server-configured
shared workspace and mutations require the shared write flag.

A link may contain no approved avatar. Its public media status is
`not_included`; it does not promise that generation is running. Publication is
immutable, so approving a later image creates a new link. Descriptions use
existing public copy or saved item names as an editable starting point. This
slice never calls an image or language model.

Public image URLs use ordinal indexes, not database IDs. Avatar bytes require
an approved, succeeded media row from the exact saved look and a ready preview
asset. Item thumbnails resolve only captured ready wardrobe or preview asset
references from the immutable snapshot. Product URLs are not fetched by this
proxy. Every image request rechecks token expiry and revocation, including after
download, and streams the bytes with `no-store`.
