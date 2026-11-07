# Stylora design decisions and traceability

Source: team design sessions on 5 and 6 November 2026. Each decision is traced
to the requirement that governs it and the Figma frame that shows it. Frames
refer to the
[Stylora Design System](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System)
file: D frames on page 04, M frames on page 05, boards on page 03.

## 1. Speed, background work and loading

| Decision                                                               | Requirement                 | Frame              |
| ---------------------------------------------------------------------- | --------------------------- | ------------------ |
| AI work starts as early as inputs are complete so results feel instant | PRD R04, WORKFLOW section 5 | D02, D04, D05      |
| Loading is always visible                                              | PRD R03, DESIGN section 14  | D03, D32           |
| Skeletons, not spinning loaders                                        | DESIGN section 14           | D32                |
| Uploading an image starts analysis in the background                   | PRD R17                     | D02                |
| Detected descriptions stream in piece by piece                         | PRD R06                     | D03, M03           |
| Description and Review with confidence run as two parallel AI calls    | PRD R05                     | D02, D03           |
| Wardrobe matching runs in the background                               | PRD R21, R24                | D03, D04           |
| Independent tasks run in parallel wherever possible                    | PRD R05                     | D17 Activity panel |
| Three missing items mean three marketplace searches at once            | PRD R29                     | D06                |
| In-app notifications show task status                                  | DESIGN section 14           | D17                |

## 2. Landing and About

| Decision                                            | Requirement               | Frame         |
| --------------------------------------------------- | ------------------------- | ------------- |
| Landing includes an animated feature demo           | PRD R13                   | D01, M01      |
| Prepared visual assets; WebP for app images         | DESIGN section 15         | Asset library |
| Image-led home with short points, not walls of text | PRD R12                   | D01           |
| About section with detail and imagery               | PRD R12, DESIGN section 5 | D01           |
| Home stays a single page                            | DESIGN section 5          | D01           |

## 3. Create flow structure and controls

| Decision                                                          | Requirement               | Frame         |
| ----------------------------------------------------------------- | ------------------------- | ------------- |
| Create has five steps and keeps its state                         | PRD R01                   | D02 to D06    |
| Stepper on top, numbered, visited steps clickable                 | PRD R02                   | D02 to D06    |
| Missing preferences show a helpful card, never a blocker          | PRD R16, R27              | D02, D19      |
| One consistent palette with no clashing colors                    | PRD R10, DESIGN section 2 | Brand board   |
| Analyze inspiration sits next to the upload controls              | PRD R15                   | D02           |
| No garment segmentation; pieces are text descriptions             | PRD R18                   | D03           |
| Next at top right, Back at bottom left, same positions everywhere | DESIGN section 3          | All frames    |
| Layouts adapt to long text                                        | DESIGN section 3          | D03, D06, R01 |
| No slashes and no all-caps labels                                 | PRD R10                   | All frames    |
| Irreversible actions are confirmed                                | PRD R11                   | D15, D17, D22 |
| Images and bullet points over long text                           | DESIGN sections 7 to 9    | D03 to D06    |

## 4. Review pieces

| Decision                                                                                                  | Requirement                                 | Frame    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------- |
| Review with confidence analyzes the whole outfit against skin tone, undertone, body shape and preferences | PRD R20                                     | D03      |
| Each detected piece carries preference-aware advice                                                       | PRD R20                                     | D03      |
| Descriptions are detailed; every visible field is filled                                                  | FASHION-PROMPT, FASHION-STRUCTURE section 4 | D03      |
| Pieces can be edited in a drawer with suggestions                                                         | PRD R19                                     | D18, M16 |

## 5. Matching, ideas and shopping

| Decision                                              | Requirement             | Frame    |
| ----------------------------------------------------- | ----------------------- | -------- |
| Suggest another regenerates one idea                  | PRD R26                 | D05, D19 |
| No estimated spend or budget on idea cards            | PRD R26                 | D05, D06 |
| Owned and alternative matches show the wardrobe photo | PRD R23                 | D04, D05 |
| Marketplace results live on the outfit detail page    | PRD R28                 | D06      |
| Every product can be saved to Wardrobe as a candidate | PRD R31                 | D06, D20 |
| Searches respect preferences where relevant           | PRD R29, FASHION-PROMPT | D06      |
| Each AI feature has a flowchart for the pitch         | WORKFLOW section 7      | Slides   |

## 6. Saving, preview and sharing

| Decision                                                               | Requirement  | Frame         |
| ---------------------------------------------------------------------- | ------------ | ------------- |
| Every saved look gets an automatic avatar image                        | PRD R44      | D14, D27      |
| Preview is in the main navigation                                      | PRD R14, R41 | Shell, D13    |
| Capsules, saved looks, sharing and preview are connected               | PRD R40, R44 | D06, D12, D26 |
| No consent step in Preview; image limits follow provider capability    | PRD R42      | D13           |
| Preview offers Save this look                                          | PRD R41, R44 | D13, M11      |
| Capsule outfits can be saved as looks                                  | PRD R40      | D12, D26      |
| Saved look detail is rich; the shared page is simple with a clean link | PRD R45      | D15, D16, D27 |
| Shared page focuses on the avatar and an item grid                     | PRD R45      | D16, M13      |
| Areas without a selected piece stay plain on the avatar                | PRD R43      | D13           |
| The avatar has a natural, elegant pose                                 | PRD R43      | D13           |
| One category tab selector, one item per category, no mode switch       | PRD R41      | D13, M11      |
| Revoked links show an unavailable page                                 | PRD R45      | D28, M22      |

## 7. Wardrobe, capsules and preferences

| Decision                                                                   | Requirement                 | Frame              |
| -------------------------------------------------------------------------- | --------------------------- | ------------------ |
| Wardrobe items are square image tiles                                      | PRD R33                     | D07, M07           |
| Wardrobe uses category tabs and a four-column desktop grid                 | PRD R33                     | D07                |
| Adding an item needs only a photo; AI writes the description               | PRD R34                     | D08, M15           |
| Capsule forms are visual with pre-filled defaults per purpose              | PRD R37, R38                | D10, D11, D23      |
| Capsule flow: Template, Purpose and context, Style and practicality, Items | PRD R38                     | D10, D11, D23, D24 |
| Five editable templates; free text only for detailed notes                 | PRD R37, R38                | D10                |
| Capsule output is several outfits, each with several items                 | PRD R39, FASHION section 10 | D12, M10           |
| Preference options are pictures, colors and illustrations                  | PRD R35                     | D09, M08           |
| Preference sections explain why each choice matters, with examples         | PRD R35                     | D09                |

## 8. Team setup

| Decision                                                                         | Where it lives       |
| -------------------------------------------------------------------------------- | -------------------- |
| WebP dataset covering clothing, shoes, hats, bags and accessories, one structure | WORKFLOW section 7   |
| Inspiration references from film stills and social posts, with rights noted      | WORKFLOW section 7   |
| Mobbin used for interaction references                                           | DESIGN section 16    |
| Polished editorial UI direction                                                  | Figma pages 03 to 05 |
