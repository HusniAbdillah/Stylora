---
name: stylora-antislop
description: Use before opening any Stylora pull request, and whenever writing UI copy, comments, commit messages or fashion text. A fast quality pass that removes generic AI output, dead code, fake data, needless abstraction and invented claims. Takes about two minutes.
---

# Anti-slop pass

Slop is output that looks finished but is generic, padded, unverified or fake.
Run this on your own diff before the pull request. Fix, do not report.

## 1. Quick scan

```
git diff origin/main...HEAD --stat
git diff origin/main...HEAD | grep -nE "console\.(log|debug)|debugger|TODO|FIXME|lorem|@ts-ignore|@ts-expect-error|eslint-disable|\bany\b|#[0-9a-fA-F]{6}\b"
git diff origin/main...HEAD | grep -nE "^\+.*(sk-|secret|apikey|api_key|signed)"
```

Each hit needs a reason or removal. Raw hex belongs only in the token file.

## 2. Code slop

- Dead code, commented-out code, unused exports, unused parameters.
- A wrapper, service, factory, hook or type that has one caller and adds no
  meaning. Inline it. No new dependency for something the platform already does.
- Comments that restate the code. Keep comments that explain why.
- Blanket `try` and `catch` that swallow errors, or defaults that hide a missing
  value. Fail with a safe error code instead.
- Casts and `any` used to silence the compiler. Fix the type or parse with Zod.
- Copy-pasted blocks. Names like `data`, `result`, `handleStuff`, `utils.ts`.
- Tests that assert the mock, snapshot markup, or cannot fail. Delete them.

## 3. Product-integrity slop (highest cost)

- Hard-coded sample data shown as if real. Samples are labeled and separate.
- Invented wardrobe IDs, products, prices, ratings, scores or model output.
- A claim that a preference, prompt file or provider was used when it was not.
- A catch that turns a provider failure into plausible fake output. Show the
  unavailable state.
- A recommendation without Why this, evidence, differences and uncertainty.
- Copy that promises privacy, accounts, ownership or identity recreation.

## 4. UI and copy slop

- Generic defaults instead of `docs/DESIGN.md`: stock gradients, random shadows,
  emoji as icons, unrelated fonts, decorative blobs, identical card grids with no
  hierarchy.
- Lorem ipsum, "Welcome to", "Seamlessly", "Elevate", "Unlock", "Effortless",
  "Powerful", "Revolutionary", "Leverage", "Delve", "game-changing", exclamation
  marks, filler intros, and em dashes as punctuation habit.
- Labels with slashes, Title Case Headings, vague buttons ("Submit", "Click
  here"). Use sentence case and a verb plus object ("Add to wardrobe").
- Error text that says "Something went wrong" with no next step.
- Any state missing: loading, empty, partial, error, retry.

## 5. Writing slop (commits, PR, docs, reports)

- Say what changed and why in plain words. No "comprehensive", "robust",
  "streamlined", no self-praise, no hedging, no repeating the diff line by line.
- Report only what ran. `Not run` is a valid result. Never write "verified" for an
  unrun check.

## 6. Deeper passes (third-party skills)

This skill is the fast two-minute pass. Go deeper only when the task calls for it:

- `antislop` core, with `antislop-ui` for screens and `antislop-copywriting` for
  prose and UI text, when you build or restyle a screen or write marketing copy.
- `antislop-code` when you add or edit code comments.
- `vercel-react-best-practices` for data fetching, bundle size, re-renders and
  hydration. `vercel-composition-patterns` when a component grows boolean props
  or needs a compound API.

All of them are subordinate to `docs/DESIGN.md`, `docs/RULES.md` and `AGENTS.md`;
see `.agents/skills/THIRD-PARTY.md`. Never stop to ask a question the project
documents already answer.

## 7. Exit rule

If the scan finds nothing, stop. Do not polish further or add tests to feel safe.
