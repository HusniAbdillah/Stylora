# Stylora

Stylora turns outfit inspiration into explained wardrobe, shopping and styling
decisions. This checkout starts with the Next.js and Supabase application
foundation. [Architecture](docs/ARCHITECTURE.md) describes the full vertical
slice plan. [Product requirements](docs/PRD.md) and
[implementation evidence](docs/PROGRESS-NEW.md) track behavior and delivery.

## Run locally

Use Node.js 22 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [Stylora](http://localhost:3000). The starter page runs with blank
configuration. For Supabase, copy `.env.example` to `.env.local` and set
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `STYLORA_WORKSPACE_ID` for your
assigned hosted workspace. Leave `DEMO_WRITES_ENABLED=false` until the workspace
is ready for shared writes.

`GET /api/health` reports configuration readiness. HTTP 503 means the
database configuration is missing or invalid. HTTP 200 confirms valid
configuration shape and reports whether provider keys are present. Use an
approved scoped query to verify actual connectivity.

## Component catalog

Run `pnpm storybook` and open [the catalog](http://localhost:6006). Foundations contains the tokens, icons, brand assets and shared controls. Shell contains responsive navigation. Features contains interactive component examples for all four owners. Use `pnpm build:storybook` for a static catalog in `storybook-static/`.

Follow the [UI library guide](src/components/ui/README.md) for semantic color tokens, fonts, assets and component imports. Shared controls live in `src/components/ui/`, navigation in `src/components/shell/`, and feature components in `src/features/<feature>/`.

## Checks

```sh
pnpm check
pnpm build
```

## Supabase and Vercel

The [Supabase workflow](supabase/README.md) covers CLI configuration,
migrations and type generation. Set runtime values separately in Vercel
Preview and Production with their assigned workspace IDs. Use Node.js 22 and
the Next.js framework preset. Keep the secret key and provider credentials
in server environment variables.
