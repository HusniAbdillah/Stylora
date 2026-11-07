# Stylora design specification

Use this specification with [PRD.md](PRD.md) and [TDD.md](TDD.md). It defines
the intended interface, not a completed visual verification. The visual language
is an editorial fashion studio: warm paper surfaces, expressive serif titles,
thoughtful clothing imagery, restrained crimson actions, and clear
explanations.

## 1. Design authority and intent

The visual reference is the Figma file
[Stylora Design System](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System):
page `03 Brand guidelines` (logo, tokens, components, imagery, voice, motion,
handoff notes and the asset library), page `04 Redesign desktop` (frames D01 to
D32 at 1440 px, plus responsive checks R01 at 1280 px and R02 at 768 px) and
page `05 Redesign mobile` (frames M01 to M22 at 390 px and M23 at 360 px). The
set covers every route, detail and edit page, destructive confirmation, empty
state, failure state and page skeleton named in this document.
Older pages in that file are archived exploration and do not override this
document. The required flow is Upload, Review pieces, Wardrobe match, Outfit
ideas, and Outfit details with shopping integrated. The product requirements
take precedence when a design artifact differs.

Premium means readable clothing detail, deliberate hierarchy, consistent action
placement, and preserved work. Use fashion imagery, swatches and garment
compositions to support decisions. Do not create decorative analytics, invented
testimonials, fake popularity counts, pricing sections, or generic marketing
filler.

Design dials: landing Energy 2, Rhythm 3, Motion 3 for the feature
demonstration; workspace Energy 2, Rhythm 2, Motion 1 for focused editing. The
recurring motif is a garment composition beside a short, evidence-based styling
note. Rich landing animation demonstrates functionality; working screens remain
calm.

## 2. Brand, palette and contrast

### Logo

The mark is one ribbon of cloth folding into an S, with a small cut swatch at
its shoulder: the piece you already own, finding its place in a new look. The
lockup pairs the mark with the lowercase `stylora` wordmark in Instrument
Serif. The master SVG is the 1108 by 1420 two-path file filled with `#73091D`;
keep it in `design-assets/` and in the Figma components `Logo / Lockup` (tones
Crimson, Paper, Night) and `Logo / Mark`.

- Default: Crimson lockup on Porcelain or Paper.
- Reversed: Paper lockup on Crimson, Night, or photography with a 45 percent
  Night scrim.
- Clear space: one mark width on every side. Minimum size: mark 16 px tall,
  lockup 96 px wide. Favicon and PWA icons use the mark only.
- Never recolor outside Crimson, Paper and Night, stretch, rotate, outline, add
  shadows or place on a busy image without a scrim.

### Tokens

The logo crimson is the single action color. Token names match the Figma variable collection `Stylora / Light`.

| Token        | Hex       | Role                                                 |
| ------------ | --------- | ---------------------------------------------------- |
| Crimson      | `#73091D` | Primary actions, active step, selected markers, logo |
| Crimson deep | `#540615` | Primary hover and pressed state                      |
| Ink          | `#211F20` | Body text and headings                               |
| Porcelain    | `#F5F2EC` | Page canvas                                          |
| Paper        | `#FFFEFC` | Cards, editing surfaces, labels on Crimson           |
| Night        | `#1B1718` | Dark editorial bands, footer, demo controls          |
| Blush        | `#F3E3E0` | Selected tabs, chips, option cards, AI advice notes  |
| Rose wash    | `#E9CFCB` | Soft panel borders, supporting text on Crimson       |
| Camel        | `#B08A62` | Editorial accents and illustrations, never text      |
| Sand         | `#E8DFD3` | Image wells and skeleton blocks                      |
| Sage         | `#6F7F63` | Calm illustration accent, never text                 |
| Stone        | `#DCD6CE` | Decorative rules and separators                      |
| Secondary    | `#6E6662` | Supporting copy and meaningful control outlines      |

A typical screen uses about 58 percent Porcelain, 20 percent Paper, 12 percent
Ink, 6 percent Crimson and 4 percent accents. Primary button labels, including
Save this look, are Paper on Crimson. Active outfit tabs and selected options
use Blush with Ink labels plus a second cue (a 2 px Crimson border, underline
or check mark). Never place Ink text on Crimson or Crimson deep.

Measured opaque sRGB contrast for the core pairings (WCAG formula):

| Foreground on background | Ratio   | Intended use                     |
| ------------------------ | ------- | -------------------------------- |
| Paper on Crimson         | 11.67:1 | Primary action label             |
| Paper on Crimson deep    | 14.74:1 | Hover label                      |
| Crimson on Porcelain     | 10.52:1 | Quiet buttons, links, kickers    |
| Crimson on Blush         | 9.45:1  | Selected chip label              |
| Ink on Porcelain         | 14.67:1 | Body and headings                |
| Ink on Paper             | 16.26:1 | Body and headings                |
| Ink on Blush             | 13.17:1 | Selected option label            |
| Ink on Sand              | 12.43:1 | Text inside image wells          |
| Secondary on Porcelain   | 5.03:1  | Supporting text at full opacity  |
| Secondary on Paper       | 5.57:1  | Supporting text                  |
| Secondary on Blush       | 4.51:1  | Minimum; avoid below 14 px       |
| Rose wash on Crimson     | 7.98:1  | Supporting text in crimson bands |
| Paper on Night           | 17.62:1 | Footer and demo controls         |
| Camel on Porcelain       | 2.82:1  | Decorative only, never text      |
| Stone on Porcelain       | 1.29:1  | Decorative separator only        |

These pairings do not certify every actual component, opacity or overlay. Check
actual states. Use a visible focus ring with a contrasting gap. Do not lower
secondary text opacity or use Stone as the only boundary of an unlabeled input.

Matching has three semantic pairs inside white cards, always with an icon and a
text label: Owned `#2F6B4F` on `#E5EFE8` (5.35:1, check icon, "In your
wardrobe"), Alternative `#8A5A12` on `#F6EAD3` (4.96:1, swap icon) and Missing
`#9B2C40` on `#F7E1E4` (5.96:1, bag icon). Counts are ordinary integers: 0, 1,
2, not padded values. Status colors are semantic exceptions, not new brand
colors to spread throughout the interface.

## 3. Typography, space and responsive structure

Instrument Serif creates the fashion-editorial voice; Inter keeps controls and
dense evidence readable. Fallbacks are Georgia and Arial. Use sentence case; no
all-uppercase display labels and no slash-separated UI text. URLs, literal code
and official catalog values are not rewritten to satisfy a copy rule.

| Role          | Desktop size and line height | Mobile direction                 |
| ------------- | ---------------------------- | -------------------------------- |
| Hero          | 64 and 68 px                 | Fluid down to about 42 and 46 px |
| Page title    | 40 and 44 px                 | 32 and 36 px                     |
| Section title | 24 and 30 px                 | 22 and 28 px                     |
| Card title    | 18 and 24 px                 | Same when readable               |
| Body          | 16 and 24 px                 | Same                             |
| Controls      | 14 and 20 px                 | At least 44 px target height     |
| Metadata      | 13 and 18 px                 | Avoid dense tiny paragraphs      |

Use a 4, 8, 12, 16, 24, 32, 48, 64 px spacing scale. Desktop content should work
at 1440 and 1280 px, with a collapsible sidebar, 24–40 px content gutters and a
bounded readable width. Stack panels on mobile with 16–20 px gutters. Test 390
px, 768 px, 1024 px, 1280 px and 1440 px as implementation gates.

Long titles, explanations, tags and filenames must wrap. Grids use shrinkable
columns; controls must not be pushed offscreen by content. Avoid fixed-height
text cards. Keep line lengths around 55–70 characters for longer reasoning. Use
disclosure for secondary detail, not truncation that removes the actual reason.

Use varied purposeful geometry: compact field corners, moderate button corners,
larger panels and overlays. Pills are for statuses or chips, not every
container. Subtle elevation indicates overlays; normal cards rely on spacing,
borders and surface contrast. Radius tokens: field 8, button 12, card 16 to 20,
panel 24, pill 999.

Action placement is identical on every page. On desktop the forward primary
action sits at the top right of the content column beside the page title, with
a one-line status note under it (for example "Three ideas are already being
prepared"). Back is a quiet link at the bottom left of the content. Card
actions sit on the bottom row of the card: quiet action left, primary right,
and cards in one row share the same height so their action rows align. On
mobile, a sticky bottom bar holds Back on the left and the primary action on
the right; when the primary action already sits beside the image (Upload), the
bottom bar is omitted rather than duplicated.

Mobile at 390 px: 16 px gutters, a compact stepper card ("2 of 5" pill, step
name, five segments, tappable Steps link that opens the step menu), horizontal
chip rails for tabs, a 3-column square wardrobe grid, swipeable idea cards with
a dot indicator, a horizontal product rail, the preview avatar above the
category tabs, a left drawer for navigation and bottom sheets for
confirmations.

## 4. Navigation and retained state

Desktop sidebar supports expanded and icon-only modes. Mobile uses an accessible
drawer with labeled controls, focus management and an obvious active
destination. Primary destinations include Create, Wardrobe, Capsules, Preview,
Saved looks and Preferences; Profile remains available as a workspace setting.

Every feature resumes its draft, filters, selections and results after
navigation. Do not show a warning that visiting Wardrobe or Preferences destroys
progress. A small Saved indicator and Return to your look link can reassure
users. Warn only when they intentionally discard or overwrite work.

The Create stepper is above the page content from the upload screen onward. Five
steps: Upload, Review pieces, Wardrobe match, Outfit ideas, Outfit details.
Active step uses color plus text or shape; completed steps use a completion cue.
Users can click visited earlier steps; future steps are disabled with a clear
reason. Forward CTAs advance after prerequisites. On mobile, keep current
position clear with a horizontally scrollable stepper or compact accessible step
menu.

## 5. Landing page

Use a two-part editorial hero: concise proposition and upload CTA on the left, a
large fashion reference with layered product demonstration on the right.
Demonstrate a scan followed by text descriptions, wardrobe results, three
directions and shopping or avatar output. Do not imply garment cutout
extraction. The illustrated demo autoplays locally and offers pause; it must not
call AI automatically.

Add a visual explanation of wardrobe reuse and connected features. Vary
composition between hero, demonstration and About content rather than repeating
identical cards. About explains the purpose, transparent reasoning and
thoughtful reuse with meaningful imagery or a process illustration. No wall of
text and no fabricated team history.

Navbar links open feature pages rather than only scrolling to sections. Upload
inspiration is the main action. Sample exploration remains explicitly
illustrative and does not masquerade as a real model result.

## 6. Upload page

Compose a large image-upload panel with a smaller context and preferences panel.
Keep the selected image fully visible with contain sizing. Put Choose image,
Replace image and Analyze inspiration together around the upload preview. Do not
place the only next-step action at the bottom of the page.

Show optional occasion and a preference card with three visual anchors:
Undertone for palette relationships, Skin tone for contrast and avatar color,
Body shape for selected silhouette goals. Missing state explains the benefit and
offers Set preferences; completed state shows actual choices and Edit
preferences. Keep technical provider configuration language out of ordinary
product copy.

Show validation beside the relevant control. Upload progress may use actual
measured bytes; AI progress uses real stage labels without fabricated
percentages. Once inputs are ready, analysis begins in the background. Clicking
Analyze inspiration opens Review immediately with its own skeleton.

## 7. Review and edit pieces

Reference image and confidence panel sit beside the main description list. Each
piece uses a name, category, color swatches, readable attribute groups, evidence
and a short preference-aware styling note. Use generic garment symbols only as
navigation aids; never represent them as extracted photographs.

Review with confidence is its own AI result with separate loading and failure
states. It discusses palette, selected profile signals, useful styling effects
and uncertainty. Keep physical observations separate from personal advice. Use
short lists and visual hierarchy rather than long paragraphs.

The editor is an accessible dialog or panel. Provide labeled fields, dropdown
suggestions with free text for common attributes, and space-preserving input.
Category remains controlled. Save changes and Cancel are consistently placed.
Show the consequence before destructive changes that invalidate subsequent
results. Add piece and remove actions remain available.

Place Match wardrobe beneath or beside the title, not only after a long list.
Stream complete descriptions into stable reserved cards as they arrive. Do not
animate fake typing after the response is already complete.

## 8. Wardrobe match page

Title: A clear view of what you have. Place Generate outfit ideas directly below
the heading in a prominent, understandable action block. Show the three status
summaries and then white item cards.

Owned and alternative rows show the real wardrobe image, the detected item
relationship, status tag, similarities and differences. Alternative explanations
must say what changes. Missing rows show a canonical text brief and why no
suitable owned option was found. No Change match control. Missing images use a
useful neutral symbol; no fake product photography.

## 9. Outfit ideas and detail

Three cards use stable ordering: closest, wardrobe, fresh alternative. Each has
a composition, concept, short Why this list, preference signals actually used,
uncertainty and selection action. Do not show estimated budgets. Owned pieces
use actual inventory images. No generated avatar is displayed unless a
corresponding completed job exists.

Empty wardrobe and absent preferences use helpful visual cards explaining the
benefit of adding data. Copy example: “Add a few pieces you own to discover more
ways to wear this look.” Preference example: “These ideas use the reference. Add
your preferences for more personal color and fit guidance.” Never show internal
field names or claim missing inputs were used.

Selected detail keeps light active tabs, a focused outfit composition, concise
Why this bullets and a prominent shopping callout near the top. Marketplace
results live on this page. Missing briefs use text, swatches and garment
symbols; real product cards may show real provider images. Save this look uses a
Paper label on Crimson. Per-option results and choices persist while switching
tabs.

## 10. Marketplace, value and wardrobe import

Group results by missing piece. Each group has its own skeleton, error or
no-results state so results can appear independently. Display provider source,
returned prices and currency, available rating details, retrieval time and
seller link. Value Score has an accessible explanation and editable priorities;
missing data is clearly absent.

Every product has Save to wardrobe. After import, distinguish Saved candidate
from Owned. The import includes actual image and description; an unavailable
image receives an honest state and retry. Candidate status must remain visible
so saving a shopping idea does not falsely imply possession.

## 11. Wardrobe and preferences

Wardrobe uses category tabs, search and an image grid. Add item begins with
image upload, followed by generated canonical description and optional
correction. Do not require a long metadata form before AI can read the photo.
Preserve edit, archive, replacement and useful empty states.

Preferences use visual selectable cards, illustrations and swatches with text
labels for accessibility. Include skin depth and explicit color reference,
undertone, contrast, palettes, style, fit, coverage, lengths, layering, body
shape, proportions, occasions, climate and meaningful comfort constraints. Each
section has a short benefit and an outfit example. Do not turn the page into an
unexplained questionnaire.

Women's and men's body-illustration tabs group selectable drawings. The selected
card needs a check and border, not color alone. Allow unselect, skip and unsure.
Do not infer identity or imply one shape is preferable. Skin examples
demonstrate optional color contrast, not compulsory dressing rules.

## 12. Capsule Studio

Five visual templates initialize editable defaults: Everyday ease, Modern
workweek, Weekend travel, Warm-weather lightness and Evening versatility. Show a
small image or composition, a brief purpose, and meaningful style cues.

Wizard steps are Template, Purpose and context, Style and practicality, and
Items. Use swatches, imagery and short choices. Keep free text for detailed
instructions. Save each step and retain state on navigation. Template
replacement after edits asks whether to replace defaults.

Results show multiple outfits, each containing several pieces and a short
rationale list. Separate owned-only combinations from proposed additions.
Missing additions display concrete reuse opportunities against existing clothes.
Keep preview, save, edit and collection navigation connected.

## 13. Preview, saved looks and public sharing

Preview has a main navigation entry. A category-tab picker allows one item per
displayed slot and optional empty categories. No single-item or full-outfit mode
selector. The avatar canvas reserves space and reports actual job status. Keep a
concise illustrative-limitations note, with no consent checkbox or blocking
consent step.

Generated avatar appearance follows explicitly selected skin swatch, undertone,
body illustration, proportions and fit goals. Pose is natural and elegant, with
clothing visible. Explain that the image is approximate. Preview includes Save
this look.

Saving a look shows two independent outcomes: outfit saved and avatar preparing
or complete. Failed generation offers retry while keeping the saved look.
Saved-look cards prioritize the avatar; a pending state must still identify the
outfit.

The public share centers on the authorized avatar, compact item grid, title and
optional catchphrase. Keep long rationale off the main public composition.
Before sharing, preview exactly what will be public. Revoked or expired links
show a clear unavailable state.

## 14. Loading, motion and confirmation

Navigate first and show a destination-specific skeleton, with shell navigation
still available. Match the skeleton to the coming layout: image and context
columns, piece rows, three option cards, product groups or avatar canvas.
Announce loading politely; do not repeatedly announce every streamed field.

Use 120–160 ms control feedback and 180–220 ms overlay transitions as starting
values. Landing demonstration may use more deliberate choreography. No scroll
hijacking or simultaneous motion on every element. Pause autoplay that continues
beyond five seconds, stop it offscreen and provide reduced-motion alternatives.

Custom dialogs confirm irreversible actions and destructive edit application.
Identify the item and consequence, offer a safe Cancel action and a specific
confirmation label, trap focus appropriately and return focus afterward. Do not
use a generic browser alert. Ordinary state-preserving navigation is not
destructive. A destructive edit dialog also lists what stays unchanged (upload,
other pieces, saved snapshots) and what is replaced (matches and ideas).

In-app status uses two layers. Toasts (Paper card, icon, title, one line)
announce a completed or failed background task without stealing focus. The
bell in the top bar opens an Activity panel listing every background task for
the current workspace with its real stage: Pieces described, Review with
confidence, Matching your wardrobe, Shopping search, Avatar image. A failed task
shows Retry in place. The bell carries a dot only while a task is running or
needs attention.

## 15. Imagery and design assets

Photography carries the brand. Use real photos for inspiration references,
wardrobe items and marketplace products. Inspiration images are shown whole
with contain sizing on a Sand well; wardrobe and product tiles use a Paper well
with contain sizing so cut-outs and lifestyle shots sit together cleanly.
Generated avatars are faceless, non-identifying figures on a warm porcelain
backdrop, rendered with the selected skin swatch and a natural pose, and always
carry an Illustrative label. Editorial flat-lays illustrate the landing, About
and the five capsule templates. Never imply that text detection produced a
cutout photograph; missing pieces use the bag symbol on Missing wash.

Asset inventory for the build (all in the Figma asset library; export WebP for
the app, JPEG or PNG for Figma uploads because Figma does not render every WebP
variant):

| Asset                                   | Source                                                                                                      | Used in                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Sample inspiration, full-length model   | Figma asset library `photo/inspiration-sample`                                                              | Landing demo, Upload, Review            |
| Four matching wardrobe photos           | Figma asset library `photo/wardrobe-*`                                                                      | Match, Ideas, Details, Preview, Share   |
| Nine dataset flat images                | Figma asset library `photo/ds-*`, from the team WebP dataset                                                | Wardrobe grid, negative match examples  |
| Four posed avatars, swatches 02 to 06   | Generated in Figma, labeled illustrative                                                                    | Landing, Preview, Saved looks, Share    |
| Three trench coat product shots         | Generated in Figma as marketplace stand-ins                                                                 | Details marketplace mockup only         |
| About flat-lay and five template boards | Generated in Figma                                                                                          | Landing About, Capsule templates, Style |
| Logo SVG, mark, lockups                 | `design-assets/stylora-mark-*.svg`, Figma `Logo / Lockup` and `Logo / Mark`                                 | Every page, share page                  |
| App icons                               | `design-assets/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png`, `icon-maskable.svg` | Favicon, PWA manifest                   |
| 34 line icons, 24 px, 1.75 stroke       | Figma `Icon / *` components, lucide-style paths                                                             | Navigation, status, actions             |
| Body shape and fit silhouettes          | Figma SVG illustrations on Preferences                                                                      | Preferences, Upload preference summary  |

Generated marketplace stand-ins exist only in mockups. The app shows real
provider images returned by SerpAPI. Owner 1 adds the icons and mark to the
app's public folder and web manifest when building the shell. Still to produce:
an Open Graph image for shared links built from the avatar and title layout, and
men's body silhouettes matching the women's set.

## 16. Reference patterns

Reviewed on Mobbin for this redesign: Alta closet grid (square image tiles and
category chips) for Wardrobe; Doji per-category look builder with Try on for
Preview; the Facebook avatar builder (canvas above category tabs) for mobile
Preview; Swiggy and Bevel photo choice cards for Preferences and capsule
templates; Rains and Zara editorial photography for the landing hero; Square
recommendation cards with consistent bottom actions for Outfit ideas. These are
interaction references only; do not copy their branding or assets.

## 17. Design acceptance

Implementation verification must cover long generated text, image failure, no
wardrobe, skipped preferences, delayed jobs, partial stream, provider errors,
stale results, deleted items, unknown prices, keyboard, mobile drawer, 200
percent zoom and reduced motion. Check all actual color pairings. Use
[PROGRESS-NEW.md](PROGRESS-NEW.md) to report evidence; no visual pass is implied
by this specification.
