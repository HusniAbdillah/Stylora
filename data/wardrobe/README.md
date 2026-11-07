# Wardrobe starter dataset

This package contains 45 source WebP photographs and reviewed English descriptions.
Each item is owned in the initial wardrobe scenario requested by the team. Its
sample source remains recorded independently. Source references, catalog labels,
visual evidence and uncertainty are preserved in the manifest.

The seed maps static source keys to workspace-specific UUIDs and uploads unchanged
bytes to private Storage. Existing records are preserved on repeated runs. A
failed run can resume using the same command. Original source metadata remains
in this package, linked to database rows by their import idempotency key.

Run from the repository root with Node 22. Set runtime credentials in a local env
file and use the workspace ID assigned to Owner 1. Environment variables override
the env file. The command verifies the expected workspace name before any write.

```powershell
node --env-file=.env.local --experimental-strip-types scripts/seed-wardrobe.mjs --dry-run --expected-workspace dev-owner-1
$env:DEMO_WRITES_ENABLED = 'true'
node --env-file=.env.local --experimental-strip-types scripts/seed-wardrobe.mjs --apply --expected-workspace dev-owner-1
node --env-file=.env.local --experimental-strip-types scripts/seed-wardrobe.mjs --verify --expected-workspace dev-owner-1
```

The apply command requires the write gate. Dry run and verification perform read
requests. All modes validate file hashes, WebP decoding, image limits and input
records. Schema migrations are unnecessary for this seed because the existing
assets and wardrobe tables support scoped assets and unique import keys.

Database descriptions use the source notes text. The user-notes field starts
empty. Photos are referenced by asset ID and stored path, with display URLs
generated when requested by the application.

New seed uploads use the workspace ID, asset ID and random filename path required
by the shared Storage helper. Earlier imported paths need the Wardrobe backend
normalization step before they can be displayed through that helper. This change
ships the dataset and seed source only.
