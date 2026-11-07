# Stylora product requirements

Version: 1.0. Product language: English. Platform: desktop-first responsive web.
Delivery: all features within a seven-hour, four-owner hackathon. This document
defines required behavior, not a claim of completion. Implementation evidence
belongs in [PROGRESS-NEW.md](PROGRESS-NEW.md).

## 1. Product purpose

Stylora turns an outfit image into practical, explained clothing decisions. A
person saves inspiration from a social feed, uploads it, reviews the detected
garments, sees credible matches in their wardrobe, compares three outfit
directions, and finds missing pieces without losing their work. The same
wardrobe and preferences support Capsule Studio, visual previews, saved looks,
and Social Fit sharing.

The primary problem is the gap between liking a look and knowing how to recreate
it. The product must answer what the pieces are, what is already available, what
alternatives genuinely work, what remains missing, and why each suggestion makes
sense. Reuse is preferred to unnecessary purchases.

## 2. Authoritative contracts

- [TDD.md](TDD.md): technical design, source contracts, migrations needed,
  asynchronous execution, and verification plans.
- [DESIGN.md](DESIGN.md): page composition, palette, interaction, responsive
  behavior, and copy.
- [FASHION-PROMPT.md](FASHION-PROMPT.md): required runtime instruction for every
  LLM fashion analysis, recommendation, regeneration, and image-direction task.
- [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md): uniform item attributes,
  descriptions, provenance, missing briefs, and explanation structure across
  every feature.
- [FASHION.md](FASHION.md): professional fashion reasoning and task-specific
  knowledge.
- [TASK.md](TASK.md), [WORKFLOW.md](WORKFLOW.md), [RULES.md](RULES.md), and
  [AGENTS.md](../AGENTS.md): ownership, delivery workflow and execution rules.
- [Stylora Design System](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System)
  Figma pages 03 to 05: brand guidelines and desktop and mobile frames for
  every requirement below.

This specification governs product intent. During the build, migrations and
generated types describe the executable database contract; a requirement that
needs a new column or endpoint gets an additive migration rather than a
workaround.

## 3. Audience, outcomes, and boundaries

Primary users want to recreate social-media inspiration, understand styling
choices, reuse existing clothes, and make informed purchases. Secondary uses are
planning multiple outfits, exploring personal style, visualizing combinations,
and sharing a look.

Success means a user can complete and resume the connected flow, correct
descriptions, understand every recommendation, and distinguish owned clothes
from purchase candidates. No invented match, product, rating, price, model
result, or personal preference may be used to create the appearance of success.

There is no login. One server-configured shared workspace is used by all
visitors. The workspace is not a personal account and offers no per-user
privacy. Use non-sensitive reference images and synthetic profile data. Private
Storage buckets are a technical access boundary, not a promise that workspace
content is private from other visitors. Public shares expose only a reviewed,
revocable snapshot.

Out of scope: payments, checkout, order placement, guaranteed fit, exact SKU
identification from pixels, model training, personal-photo identity recreation,
and unrestricted web scraping. No requested product feature is deferred to an
MVP. Provider failures remain explicit; sample journeys are separate and
labeled, never silently substituted for real AI.

## 4. Product invariants

| ID  | Required behavior                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Persist Create progress and every other page's meaningful drafts, filters, selections, results, and pending work. Navigation and reload must not reset the task.                                                                                                                            |
| R02 | Display a top stepper throughout Create: Upload, Review pieces, Wardrobe match, Outfit ideas, Outfit details. Highlight the active step. Previously visited steps are clickable without rerunning work; future steps cannot be skipped through the stepper. Forward CTAs enforce readiness. |
| R03 | Navigate to the destination immediately and display its tailored skeleton while data loads. Never wait for AI on the departing page before navigation.                                                                                                                                      |
| R04 | Start eligible AI and search work automatically in the background as soon as complete, stable inputs are available. Cache by input revision; do not call providers for incomplete inputs or on every keystroke.                                                                             |
| R05 | Run independent provider tasks concurrently. Description and Review with confidence are separate parallel tasks; missing-item marketplace searches run in parallel. Respect real dependencies and bounded provider concurrency.                                                             |
| R06 | Stream complete validated detected items as they become available. Do not wait for the entire description response to finish. Partial content remains provisional until final validation.                                                                                                   |
| R07 | Every fashion LLM task includes FASHION-PROMPT.md and relevant FASHION.md knowledge; every item description and missing brief follows FASHION-STRUCTURE.md.                                                                                                                                 |
| R08 | Every recommendation explains Why this, actual inputs used, meaningful differences, and uncertainty. Optional preferences are never invented.                                                                                                                                               |
| R09 | Match only plausible functional substitutes. Color and broad category agreement alone cannot make a football jersey an alternative to a formal fashion top.                                                                                                                                 |
| R10 | Keep palette and action placement consistent. Dark primary buttons use light text. Long text wraps without hiding controls. Visible copy uses sentence case and no slash-separated labels.                                                                                                  |
| R11 | Confirm irreversible or destructive changes with an accessible custom dialog, including deletion, permanent replacement, destructive edit application, clearing saved work, and share revocation. Ordinary navigation preserves state and needs no progress-loss warning.                   |

## 5. Landing and navigation

**R12.** The landing is editorial and image-led: a concise hero, a compelling
animated demonstration, direct feature navigation, useful feature previews, and
an About section with substantive content and an original visual. Keep the
fashion illustration motif and use motion to explain capabilities rather than
decorating a wall of text.

**R13.** The demonstration autoplays through a reference scan, text
descriptions, wardrobe classification, three directions, and integrated shopping
or preview. A scanner effect may illustrate detection, but it must not imply
real garment segmentation or a live request. Include pause and reduced-motion
behavior. Demonstration data is explicitly illustrative; autoplay does not spend
API credits.

**R14.** Navbar entries link to working feature destinations: Create, Wardrobe,
Capsules, Preview, Saved looks, and Preferences, with responsive overflow as
needed. About remains meaningful content, not the only alternative to anchor
navigation. Profile is a workspace setting, not an authentication surface.

## 6. Create journey

### 6.1 Upload inspiration

**R15.** Accept JPEG, PNG, or WebP up to 10 MiB through the approved
signed-upload flow. Show the original image, validation, upload status, replace
and remove actions, and retry. Place Analyze inspiration beside the chosen image
or upload controls, not at the page bottom. Occasion is optional, editable,
persisted, and supplied to the AI context.

**R16.** A prominent preferences section explains Undertone, Skin tone, and Body
shape with visual examples of palette contrast and silhouette choices. If
preferences are missing, show the benefit and Set preferences action. If
present, show selected values and Edit preferences. Visiting Preferences and
returning restores the image, occasion, and task state.

**R17.** Once the uploaded object is verified and context is stable, schedule
description and Review with confidence in parallel using
[FASHION-PROMPT.md](FASHION-PROMPT.md). Descriptions use
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md). Changing the image or occasion
invalidates only dependent results. Analyze inspiration advances to Review
immediately, showing cached output or a destination skeleton.

### 6.2 Review pieces

**R18.** Display the whole reference image beside text-based garment
descriptions. Do not present invented segmented item images. Add visual
hierarchy through color swatches, category symbols, attribute groups, evidence
labels, and short advice lists. Complete validated pieces appear progressively.
Users can add, edit, and remove pieces.

**R19.** Piece editing preserves spaces while typing. Common pattern, material
appearance, texture, fit, cut, occasion, and style-tag values have suggestions
and free-text entry. Category remains a controlled enum. Saving a revision
invalidates dependent matches and recommendations, not the original upload or
unrelated saved work.

**R20.** Review with confidence is a genuine separate LLM analysis using
[FASHION-PROMPT.md](FASHION-PROMPT.md), with structured advice linked to
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md). It explains palette, selected skin
tone and undertone, self-selected body profile, fit goals, and uncertainty where
supported. Per-piece descriptions include separate conditional styling advice;
physical garment facts must not change to fit the user's preferences.

**R21.** Put Match wardrobe near the page title using the standard
primary-action pattern. Background matching starts when a complete reviewed or
stable detection revision exists, not while a piece is half-edited. A failed
confidence review does not erase successful descriptions; each task has an
independent retry.

### 6.3 Wardrobe match

**R22.** A distinct screen titled A clear view of what you have displays three
outcomes: In your wardrobe, Alternative in your wardrobe, and Missing. Counts
are plain integers including 0. White cards use distinct status tags and icons,
with restrained green, amber, and rose semantic treatments. Do not offer Change
match or a manual substitute picker.

**R23.** Owned and alternative entries display the real corresponding wardrobe
image, name, shared attributes, differences, and explanation. Missing entries
use a useful text brief or garment symbol, never a fabricated product photo. If
an owned image is unavailable, show an honest image-unavailable state.

**R24.** Matching explanations use [FASHION-PROMPT.md](FASHION-PROMPT.md) and
the canonical descriptions in [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md).
Missing means no credible owned candidate, not merely a low numeric score. A
prominent Generate outfit ideas CTA sits beneath the title. Eligible
recommendation work begins in the background and the CTA opens its result screen
immediately.

### 6.4 Three outfit ideas

**R25.** Present exactly three directions: Closest to the inspiration, From your
wardrobe, and A fresh alternative. Each includes a distinct title, concise
concept, ordered pieces, Why this reasons, actual preference signals, meaningful
differences, and uncertainty, generated using
[FASHION-PROMPT.md](FASHION-PROMPT.md). All item and missing descriptions follow
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md).

**R26.** Do not show estimated budgets or budget plans on these cards. Show
actual wardrobe photos for owned or alternative pieces. Use an honest
composition or labeled illustration when no generated outfit image exists. A
missing piece uses text or an icon, not a fake cutout. Suggest another
regenerates only the chosen direction with a visible pending state and preserved
previous output until replacement is valid.

**R27.** When preferences or wardrobe are empty, use helpful visual sections
explaining benefits and offering direct setup actions. Never show raw provider
or internal diagnostic phrasing about empty inputs. From your wardrobe contains
only owned items; if none exist, its direction is visibly unavailable rather
than fabricated. Preferences remain optional.

### 6.5 Outfit details and marketplace

**R28.** Selecting a direction opens its detail with integrated marketplace
results on the same page. Do not require a separate marketplace page. Keep
independent state for all three option IDs so switching directions restores
results and selected products.

**R29.** Start searches for missing slots automatically at detail entry at the
latest; preferably prefetch once all three valid options exist. Run independent
missing-item searches concurrently, deduplicating identical briefs. Show each
result as it finishes; one failed item must not hide the others. Do not search
owned slots.

**R30.** Place the missing-piece marketplace callout near the top. Show concise
Why this bullets, light active option tabs with dark readable labels, and a Save
this look button with white text. Missing briefs use text-based visual cards.
Product cards show real provider imagery, source, returned price and currency,
rating information when available, retrieval time, and a validated seller link.

**R31.** Every search-result card has Save to wardrobe, copying its image and
canonical description. Import into wardrobe as a clearly labeled saved
candidate; only an explicit Mark as owned action makes it eligible for owned
matching. Failed image import preserves a retryable state and must not claim the
image was saved.

**R32.** Value Score is transparent and deterministic, with adjustable price,
rating, and relevance weights. Unknown factors remain absent and weights are
normalized over available evidence. No cross-currency price ranking without an
explicit conversion source. Explain shipping and freshness limitations. Any LLM
fashion explanation of a product uses [FASHION-PROMPT.md](FASHION-PROMPT.md) and
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md); the LLM does not invent the score.

## 7. Wardrobe, preferences, and profile

**R33.** Wardrobe categories use tabs, with search, filters, images, item
details, edit, archive, and image replacement. Preserve filters and scroll
context when returning. Keep explicit sample inventory separate from actual
stored ownership.

**R34.** Adding a wardrobe item begins with image upload only; no required
metadata form before analysis. Automatically describe the image using
[FASHION-PROMPT.md](FASHION-PROMPT.md) and
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md), then let the user confirm or
correct. Multiple visible garments require a selection or separate item records,
never one misleading combined item. Provider failure keeps the uploaded draft
and offers retry or explicit manual entry without fake AI output.

**R35.** Preferences offer meaningful visual choices for skin depth and swatch,
undertone, contrast, color families, style references, fit, coverage, length,
layering, body shape, proportions, relevant climate and occasions, fabric
dislikes, footwear comfort, and care tolerance. Each section explains why it
helps, with an illustrated outfit example. Body shapes use selectable
illustrations in women's and men's tabs with skip and clear controls. Selecting
an illustration is reversible and does not infer identity. All optional fields
support unknown or unsure.

**R36.** Persist preference drafts and saved selections. Canonical preference
keys and specific skin swatch values are shared across analysis, matching,
outfits, capsules, and avatars. Example guidance is conditional rather than
“this skin tone must wear these colors.” The Profile page retains the shared
display name and clear data scope.

## 8. Capsule Studio

**R37.** Provide exactly five editable starting templates: Everyday ease, Modern
workweek, Weekend travel, Warm-weather lightness, and Evening versatility.
Selecting one fills all applicable brief defaults while leaving personal
preferences and actual inventory authoritative. Users can edit every default.
Explain any field that still needs their input.

**R38.** Use a short visual wizard: Template, Purpose and context, Style and
practicality, Items. Use images, swatches, selectable illustrations, and concise
controls; reserve free text for details. Preserve each step, selections, and
output when navigating away. Do not render one long text-heavy form.

**R39.** Generate multiple complete outfits from wardrobe IDs and text using
[FASHION-PROMPT.md](FASHION-PROMPT.md), the capsule guidance in
[FASHION.md](FASHION.md), and [FASHION-STRUCTURE.md](FASHION-STRUCTURE.md). Do
not send wardrobe photographs for capsule reasoning. Each combination has
concise reasons, input signals, uncertainty, and meaningful variation. Show
owned-only combinations separately from combinations needing additions.

**R40.** Recommend additions only with a clear role gap and multiple concrete
reuse opportunities against existing IDs. Prefer at least three supported uses;
state fewer honestly. Templates and count controls respect validated bounds.
Background generation begins only after the brief and selected items are
complete. Editing required inputs invalidates stale suggestions. Keep create,
edit, delete, saved-look conversion, outfit detail, preview, and save actions
connected.

## 9. Preview, saved looks, and sharing

**R41.** Preview is a primary navigation destination. One category-tab selector
replaces separate single-item and full-outfit modes. Select at most one item per
displayed category slot, allow empty categories, and require at least one item
overall. Accessory subcategory tabs may represent bags, belts, or jewelry.
Preserve selections and generated results when leaving.

**R42.** Do not show a consent checkbox or blocking consent step for the
non-identifying avatar preview. Show a concise illustrative-limitations notice.
Image count, byte limits, and dimensions must follow verified provider and
storage capabilities rather than an arbitrary UI mode. The server and database
contracts contain no consent fields, and nothing submits a fabricated
acknowledgment.

**R43.** Preview and saved-look avatar prompts include
[FASHION-PROMPT.md](FASHION-PROMPT.md), canonical items from
[FASHION-STRUCTURE.md](FASHION-STRUCTURE.md), and all selected visual
preferences. Use a stable skin swatch ID and explicit color value; match
selected undertone, body illustration, proportions, and fit intent. Missing
preferences use a neutral mannequin. Request natural, elegant outfit-appropriate
poses and preserve garment details. Images are illustrative, not fit guarantees.

**R44.** Save this look from every supported surface saves an immutable outfit
snapshot and automatically schedules an avatar image, stores its asset, and
displays queued, running, failed, or complete status. A failed image must not
roll back a successful save. Retry must not duplicate the saved look. Preview
includes Save this look and can reuse a matching completed avatar.

**R45.** Saved looks support browse, reopen, and share. The public share is
image-led: generated avatar as the focal point, compact item grid, title, and
optional catchphrase. Avoid long explanations. Share publication requires review
of exactly what will be public; links expire and can be revoked. Only approved
media and display fields are disclosed, never full wardrobe, private paths, or
preference values.

## 10. Operational and data requirements

Use Next.js App Router with server-only Supabase access, online Supabase
PostgreSQL and private Storage, Muse for the configured AI path, and SerpAPI for
shopping. The OpenAI-compatible SDK does not imply OpenAI-hosted inference. An
OpenAI vision adapter for wardrobe reading is an explicit provider decision if
required, not an automatic switch from MODEL_API_KEY.

All writes validate input, use the server workspace, and preserve revision
consistency across parents and children. Uploads enforce MIME, byte size, random
paths, object verification, and private buckets. Never persist signed URLs.
Public sharing remains a token-scoped projection.

Background work requires persistent jobs and an actual executor. Idempotency,
input fingerprints, bounded retries, cancellation, stale-result rejection, and
per-task status are mandatory. Neither a browser timer nor an un-awaited Vercel
promise satisfies persistence. Parallelism must be bounded by quotas and costs.
Never charge repeated work on passive page reload.

## 11. Acceptance and success measures

Every R requirement above needs evidence in PROGRESS-NEW.md. Verify the
connected path: upload, incremental review and independent confidence advice,
correction, credible matching, three directions, same-page shopping, candidate
import, save with avatar, and revocable image-led share. Separately verify
visual preferences, wardrobe upload-only entry, capsule templates and multiple
combinations, and category-based preview with save.

Required failure scenarios include rejected image type and size, empty wardrobe,
missing preferences, provider authorization and rate errors, timeout, partial
stream, malformed output, database failure, unavailable image, revision
conflict, interrupted navigation, stale background completion, duplicate
submission, and revoked share. No scenario may erase unrelated work or invent
successful output.

Measure task completion, resume success, first useful item time, provider
requests per input revision, time to three options, missing-slot search success,
explanation evidence coverage, match rejection quality, capsule reuse, save and
avatar completion separately, and share revocation correctness. These are
measurement definitions, not claimed production statistics. Acceptance targets
include zero invented owned IDs, zero profile claims for absent fields, one
logical job per identical input, and no lost persisted progress during
navigation.

## 12. Delivery and risk management

All features remain in the seven-hour scope with four owners and shared
checkpoints in TASK.md. Scope is not reduced to hide integration gaps. Report
blocked capabilities and actual evidence rather than declaring success from a
build alone.

Primary risks are provider latency and quota, ambiguous images, implausible
alternatives, conflicting edits in the shared workspace, stale automatic
results, image rights and source access, schema drift, and the size of the
delivery scope. Mitigations are structured evidence, hard matching gates,
revision-aware jobs, explicit ownership state, safe source handling, coordinated
migrations, and frequent integration. Remaining decisions such as worker
deployment, model access, avatar output limits, and source-image import policy
are release blockers recorded in TDD.md and TASK.md; they do not authorize cloud
changes in a documentation task.
