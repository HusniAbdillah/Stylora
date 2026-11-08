<div align="center">
  <img src="public/design/brand/lockup-crimson.svg" alt="Stylora logo" width="220" />
  <h1>Stylora</h1>
  <p><strong>Turn outfit inspiration into clothing decisions you can explain.</strong></p>
  <p>Sea × OpenAI Hackathon · Indonesia</p>
  <p><strong>Codex Made Us Do It · Group 12</strong></p>
  <p>
    <a href="https://stylora.ai.id/"><strong>Live demo</strong></a> ·
    <a href="https://github.com/HusniAbdillah/Stylora"><strong>GitHub repository</strong></a>
  </p>
</div>

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript_5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge)

</div>

## The problem

Saving an outfit photo is easy. Knowing how to recreate it is harder. You still
need to identify the pieces, check what you already own, judge whether an
alternative works, and decide which missing items are worth buying.

Stylora connects those decisions in one workspace. Start with an inspiration
image, review the garment descriptions, match against your wardrobe, compare
outfit directions, and explore missing pieces with reasons behind each choice.
The goal is to make better use of existing clothes before adding more.

## What Stylora does

| Feature | User workflow |
| --- | --- |
| **Create from inspiration** | Upload an outfit reference, review and correct detected pieces, then continue through wardrobe matching and outfit ideas. |
| **Wardrobe** | Add garment photos and descriptions, edit item details, and distinguish owned pieces from saved shopping candidates. |
| **Explained matching** | See owned matches, plausible alternatives, and missing pieces with evidence and uncertainty. |
| **Three outfit directions** | Compare interpretations of an inspiration, including a direction restricted to owned wardrobe items. |
| **Shopping in context** | Search for missing pieces within outfit details and compare available price, rating, and relevance evidence. |
| **Capsule Studio** | Plan a smaller collection around a brief and generate distinct outfit combinations that reuse owned items. |
| **Preview** | Select outfit pieces and generate an illustrative, preference-aware avatar preview. |
| **Saved looks and Social Fit** | Save an outfit snapshot, review its public presentation, create a share link, and revoke it later. |
| **Preferences** | Explicitly select optional appearance and fit preferences used by supported styling and preview tasks. |

These workflows depend on the configured workspace, enabled writes, and the
providers each task requires. See [implementation evidence](docs/PROGRESS-NEW.md)
for task-level checks, integration limits, and outstanding work.

## Hackathon build directions

Stylora focuses on two of the event's build directions:

- **AI-Native Products & Operations:** connect image understanding, owned
  inventory, styling explanations, product discovery, and visualization in a
  single decision flow.
- **Deep Domain AI:** use structured garment attributes and fashion guidance
  to reason about occasion, silhouette, fit, palette, and functional
  compatibility. A similar color alone does not make two garments substitutes.

The practical value is helping someone understand what they can recreate now,
which alternatives make sense, and what is actually missing. We do not claim
measured savings, guaranteed fit, or exact product identification from a photo.

## Team

**Codex Made Us Do It · Group 12**

| Member | Role |
| --- | --- |
| Gilang Agung Prakoso | Team Leader |
| Husni Abdillah | Team Member |
| Wandy Chandra Wijaya | Team Member |
| Fauzan Arif Tricahya | Team Member |

## How we used Codex

Codex supported work across the application: translating requirements into
feature slices, implementing frontend and server workflows, integrating shared
contracts, writing focused regression checks, and resolving integration issues.
Repository-specific skills and owner boundaries guided that work.

Examples recorded in [the development log](docs/PROGRESS-NEW.md) include:

- Inspiration uploads, garment descriptions, confidence review, and recovery
  across the Create journey.
- Wardrobe schemas and marketplace-candidate compatibility fixes.
- Product search, saved-look snapshots, and public-sharing review flows.
- Preview composition validation and image-request regression checks.

[Agent instructions](AGENTS.md), [project skills](.agents/skills/), and
[the delivery workflow](docs/WORKFLOW.md) document task boundaries, verification,
and human review. Codex is a development tool; application inference uses the
configured OpenAI models.

## Architecture and stack

```text
Browser: Create, Wardrobe, Capsules, Preview, Saved looks, Preferences
                              |
                   Next.js server boundary
                Validation and workspace scoping
                   /          |           \
          Supabase          OpenAI        SerpAPI
       Database and      Fashion analysis  Missing-piece
       private Storage   and image tasks   product search
```

| Layer | Technology |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript 5.9 |
| Styling and components | Tailwind CSS 4, Radix UI, shared Stylora components |
| Data and media | Hosted Supabase database and private Storage buckets |
| Fashion and image tasks | Server-side OpenAI requests with structured validation |
| Product discovery | SerpAPI and normalized product evidence |
| Validation | Zod schemas and domain checks |
| Development checks | ESLint, TypeScript, Vitest, Storybook |
| Hosting configuration | Vercel |

Supabase access and provider credentials stay on the server. Persisted drafts
and operations carry task identity and revision information for retry and stale
result handling. See [architecture](docs/ARCHITECTURE.md) and
[technical design](docs/TDD.md) for execution boundaries.

## Run locally

### Prerequisites

- Node.js **22.x** and pnpm **10.26.2**, as pinned in `package.json`.
- A configured hosted Supabase workspace for database-backed features.
- An OpenAI API key for live analysis and generated images.
- A SerpAPI key for product search.

### 1. Clone and install

```sh
git clone https://github.com/HusniAbdillah/Stylora.git
cd Stylora
pnpm install --frozen-lockfile
```

### 2. Configure the environment

Copy `.env.example` to `.env.local`:

```sh
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Set the relevant values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Hosted Supabase project URL. |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret key. |
| `STYLORA_WORKSPACE_ID` | Existing workspace assigned to this environment. |
| `DEMO_WRITES_ENABLED` | Defaults to `false`; enable when changes to the assigned shared workspace are intended. |
| `OPENAI_API_KEY` | Live fashion analysis and image generation. |
| `OPENAI_TEXT_MODEL` | Text model; the example defaults to `gpt-6-luna` with low reasoning. |
| `OPENAI_IMAGE_MODEL` | Image model; the example defaults to `gpt-image-2.6-flare`. |
| `OPENAI_IMAGE_QUALITY` | Image quality; the example defaults to `medium`. |
| `SERPAPI_API_KEY` | Missing-piece product search. |
| `STYLORA_LANDING_SAMPLE_LOOK_ID` | Optional existing look used for the landing sample. |

Do not commit `.env.local`. Use the team's assigned hosted workspace; copying
the environment file does not create tables, buckets, or workspace records.
See [the Supabase setup guide](supabase/README.md) for database preparation.

### 3. Start the application

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

`GET /api/health` reports configuration readiness. HTTP 503 indicates missing or
invalid database configuration. HTTP 200 confirms configuration shape and reports
provider-key presence; it does not verify database connectivity or provider
responses. Unconfigured providers return unavailable states rather than silently
substituting sample results.

For navigation-independent AI work, configure worker mode and start the separate
consumer. Both processes need the same workspace, dedicated worker secret and
daily quotas. See [worker setup and deployment](docs/AI-WORKER.md) and the
[model evaluation](docs/AI-RESEARCH.md). Worker mode refuses new allocations
without a fresh consumer heartbeat; a job row alone does not execute work.

## Demo walkthrough

Use the [live demo](https://stylora.ai.id/) or a configured local instance.
Event presentations are in English: **6 minutes for the demo and pitch,
then 2 minutes for questions**.

1. **Introduce the decision.** Show an outfit reference and explain the gap
   between liking the look and knowing how to recreate it.
2. **Review the pieces.** Open Create, upload the reference, review the detected
   garments, and correct a detail if needed.
3. **Reuse the wardrobe.** Show matches, alternatives, and missing items. Open
   an explanation and show why a substitution is plausible.
4. **Compare directions.** Review the outfit options, then inspect a missing
   piece and its available shopping evidence.
5. **Save and visualize.** Save a look, show its preview when generation
   succeeds, and demonstrate the public-share review.
6. **Explain Codex's contribution.** Point to concrete implementation and
   verification examples in the development log.

Capsule Studio is an additional path for demonstrating wardrobe reuse. Labeled
sample content supports exploration; sample outfits and images are not evidence
that a live provider request succeeded.

## Development commands

```sh
pnpm check              # Lint, generate route types, typecheck, and run tests
pnpm build              # Production build
pnpm start              # Serve the production build
pnpm storybook          # Component catalog at http://localhost:6006
pnpm build:storybook    # Static component catalog
```

These are available commands, not a claim that they passed for every checkout.
Recorded results and their limits live in [the development log](docs/PROGRESS-NEW.md).

## Repository structure

```text
Stylora/
├── src/
│   ├── app/             # Pages, route handlers, and application shell
│   ├── components/      # Shared UI and navigation
│   ├── features/        # Inspiration, matching, outfits, wardrobe, capsules,
│   │                    # products, decisions, preview, sharing, and operations
│   ├── lib/             # Server configuration and shared infrastructure
│   ├── prompts/         # Runtime fashion guidance
│   └── types/           # Shared types and generated database contract
├── public/design/       # Brand and design assets
├── assets/              # Source assets
├── data/                # Wardrobe and demonstration datasets
├── supabase/            # Migrations, seeds, and database checks
├── scripts/             # Development and verification tools
├── docs/                # Requirements, architecture, workflow, and evidence
└── .agents/skills/      # Repository-specific Codex procedures
```

## Demo boundaries

- **One shared workspace, no login.** Visitors use the same configured dataset.
  Enabled writes can change data visible to other visitors. Use non-sensitive
  reference images and synthetic profile information.
- **Illustrative previews.** Generated avatars do not guarantee fit, exact
  appearance, or recreation of a person's identity.
- **Explicit preferences.** Appearance and fit preferences are user-selected,
  not inferred from the person in an inspiration photo.
- **Evidence-aware shopping.** Unknown prices, ratings, and availability stay
  unknown. A saved product candidate becomes owned through an explicit action.
  Checkout and order placement are outside the application scope.
- **Reviewed sharing.** Public links publish a saved snapshot and approved
  media; links can be revoked.

## Submission declarations

**Event:** Sea × OpenAI Hackathon, Indonesia. **Team:** Codex Made Us Do It,
Group 12.

Project-specific work includes the connected styling workflows, garment and
recommendation contracts, workspace integration, product comparison, preview
composition, saved-look sharing, and Stylora's interface.

Third-party foundations include Next.js, React, Tailwind CSS, Radix UI, Zod,
the Supabase client, Sharp, and the development tools listed in
[`package.json`](package.json). OpenAI and SerpAPI are external services.
Copied third-party agent skills and their provenance are listed in
[the skills inventory](.agents/skills/THIRD-PARTY.md). Dependencies and assets
remain subject to their respective licenses.

The final submission must identify any pre-existing code or assets and confirm
which work was built exclusively during the event. The feature list describes
project scope; it does not certify build timing.

## Further reading

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technical design](docs/TDD.md)
- [Implementation and verification evidence](docs/PROGRESS-NEW.md)
- [UI library guide](src/components/ui/README.md)
- [Delivery workflow](docs/WORKFLOW.md)
