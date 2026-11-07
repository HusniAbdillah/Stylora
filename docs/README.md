# Stylora

Stylora is a responsive fashion studio that connects outfit inspiration,
wardrobe reuse, explained recommendations, marketplace discovery, capsule
planning and illustrative outfit previews. These documents plan a build for a
seven-hour hackathon with four accountable owners. Every feature is in scope.

The application uses one shared workspace with no login. Visitors can change the
same data when writes are enabled. Use non-sensitive outfit references and
synthetic personalization; this is not a private wardrobe or a personal-photo
try-on service.

## Product journey

Upload an inspiration image, review editable garment descriptions, inspect
credible wardrobe matches, compare three outfit directions, and open a selected
outfit with marketplace results on the same page. Drafts and results survive
navigation. Saved looks automatically request a preference-aware avatar, and
public sharing presents approved imagery with a compact item grid.

Wardrobe supports photo-led item intake and editing. Preferences use meaningful
visual choices. Capsule Studio builds multiple combinations from item IDs and
text, with reusable additions where needed. Preview uses category-based
selection rather than separate single and combination modes.

## Documentation map

| Document                                     | Purpose                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- |
| [PRD.md](PRD.md)                             | Product requirements and acceptance IDs                              |
| [TDD.md](TDD.md)                             | Routes, contracts, data model, background execution and verification |
| [DESIGN.md](DESIGN.md)                       | Brand, palette, layout, interaction, motion and responsive behavior  |
| [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md) | Canonical item taxonomy, attributes, provenance and explanations     |
| [FASHION-PROMPT.md](FASHION-PROMPT.md)       | Runtime fashion instruction for every fashion AI task                |
| [FASHION.md](FASHION.md)                     | Fashion reasoning handbook and prompt-budget research                |
| [TASK.md](TASK.md)                           | Four-owner assignments and checkpoints                               |
| [WORKFLOW.md](WORKFLOW.md)                   | Environments, Git rhythm, Figma handoff and detailed TODO            |
| [REVISION-FLOW.md](REVISION-FLOW.md)         | Team design decisions traced to requirements and Figma frames        |
| [PROGRESS-NEW.md](PROGRESS-NEW.md)           | Progress and evidence template                                       |
| [RULES.md](RULES.md)                         | Product, engineering and integrity rules                             |
| [AGENTS.md](../AGENTS.md)                    | Instructions for coding agents                                       |
| [AGENT-PLAYBOOK.md](AGENT-PLAYBOOK.md)       | Running four parallel Codex sessions, skills and merge rhythm        |
| [DATABASE.md](DATABASE.md)                   | Owner 3 backend brief                                                |
| `../assets/`                                 | Logo SVGs and app icons                                              |
| `../.agents/skills/`                         | Project skills for Codex                                             |

The visual source is the
[Stylora Design System](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System)
Figma file, pages 03 to 05: brand guidelines, components, the asset library and
desktop and mobile frames for every page and state.

## Planned stack

| Layer      | Choice                                                                               |
| ---------- | ------------------------------------------------------------------------------------ |
| Runtime    | Node.js 22, pnpm                                                                     |
| App        | Next.js App Router, React, strict TypeScript, Vercel                                 |
| UI         | Tailwind CSS with Figma tokens, Radix primitives, Motion, Inter and Instrument Serif |
| Validation | Zod                                                                                  |
| Data       | Hosted Supabase PostgreSQL and private Storage, server-side access only              |
| AI         | OpenAI API with `gpt-5-mini` (text and vision) and `gpt-image-1.5`                   |
| Shopping   | SerpAPI                                                                              |
| Quality    | ESLint, TypeScript, Vitest, Prettier, GitHub Actions                                 |

The OpenAI-compatible SDK is only a transport. Provider changes need explicit
configuration and contract validation.

## Setup at the start of the event

1. Create the GitHub repository with branch protection on `main`, a pull
   request template and a CI workflow running lint, typecheck and tests.
2. Create the Next.js app with pnpm and strict TypeScript, add the dependencies
   above, and define scripts: `dev`, `build`, `check` (lint, typecheck, test),
   `format:check`, `db:types` and `db:test`.
3. Create one hosted Supabase project, private buckets `inspiration`,
   `wardrobe` and `previews`, and the workspace rows listed in WORKFLOW.md.
4. Connect the repository to Vercel with production and preview environment
   variables.
5. Each developer copies `.env.example` to `.env.local` and fills values from
   the team's password manager.

| Environment name        | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `SUPABASE_URL`          | Hosted project endpoint                   |
| `SUPABASE_SECRET_KEY`   | Server-only privileged access             |
| `STYLORA_WORKSPACE_ID`  | Workspace used by every server query      |
| `DEMO_WRITES_ENABLED`   | Shared write gate, defaults to false      |
| `MODEL_API_KEY`         | OpenAI API access on the server           |
| `SERPAPI_API_KEY`       | Marketplace search on the server          |
| `SUPABASE_PROJECT_ID`   | CLI project selection and type generation |
| `SUPABASE_ACCESS_TOKEN` | CLI-only credential                       |
| `SUPABASE_DB_PASSWORD`  | CLI-only credential                       |

Never prefix secrets with `NEXT_PUBLIC_`. The write gate is not authentication.
Signed URLs are temporary; records store paths and asset IDs.

## Working as one of four owners

Owner 1 owns wardrobe, preferences, profile, shared UI and schema. Owner 2 owns
landing and the Create flow through three outfit ideas. Owner 3 owns outfit
details, shopping, saving and sharing. Owner 4 owns execution, capsules and
previews. TASK.md and WORKFLOW.md describe contracts, merge windows and the
time-boxed TODO.

All fashion AI tasks include FASHION-PROMPT.md and validate against
FASHION-STRUCTURE.md. Keep optional profile data truthful, explain Why this, and
keep marketplace candidates separate from owned items.

## Visual foundation

The brand color is the logo crimson `#73091D` (hover `#540615`) on Porcelain
`#F5F2EC` and Paper `#FFFEFC`, with Ink `#211F20`, Night `#1B1718`, Secondary
`#6E6662` and Stone `#DCD6CE`. Blush `#F3E3E0`, Rose wash `#E9CFCB`, Camel
`#B08A62`, Sand `#E8DFD3` and Sage `#6F7F63` are supporting tones. DESIGN.md
defines contrast, components and page behavior.
