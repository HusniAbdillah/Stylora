# Stylora UI

Run `pnpm storybook` from the repository root to review components in isolation. Use the viewport control or resize the browser to switch between desktop, tablet and mobile. Stories use illustrative fixtures and callbacks. Feature components receive inventory, prices, preferences, media and operation status from their caller.

## Design source

Use the current [brand and component library](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System?node-id=250-394), [desktop frames](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System?node-id=250-395) and [mobile frames](https://www.figma.com/design/ta9JYu4Q7fLWeuu0PJgWhp/Stylora-Design-System?node-id=250-396). Match frames by their D, M and R identifiers.

## Where components belong

| Location | Use |
| --- | --- |
| `src/components/ui` | Shared buttons, chips, badges, icons, logos, feedback, dialogs and stepper |
| `src/components/shell` | Workspace sidebar, rail, mobile top bar, drawer and activity panel |
| `src/features/<feature>` | Feature controls, cards and sections, with their TypeScript props and component stories |
| `src/app/globals.css` | Tailwind v4 theme, semantic variables, typography, radii and motion |
| `public/design` | Local Figma icon masters, logo variants, artwork and preference illustrations |

Use `bg-surface text-ink`, `bg-action text-on-action`, `font-display text-page`, `text-control`, `rounded-panel` or CSS variables such as `var(--color-action)`. Brand values live in the theme. Swatch values supplied with a specific garment or selected skin reference are data. Inter and Instrument Serif ship through the build from pinned Fontsource packages.

```tsx
import { Badge, Button, Icon } from "@/components/ui";

<Badge tone="owned">In your wardrobe</Badge>
<Button variant="secondary" onClick={openIntake}>
  <Icon name="upload" size={18} /> Add item
</Button>
```

Use `Button asChild` to style a link. Use `Chip` with `selected` and a change callback. `ConfirmDialog` accepts `open`, `onClose`, `onConfirm`, `title`, `description` and `confirmLabel`. The trigger owns the state. `Stepper` uses a zero-based current step and an explicit array of visited indices.

The icon mask inherits the text color. Use `iconNames` for the full list. Provide an accessible name on an icon-only control. Use `Logo` for the full lockup or `Logo markOnly` for the rail. The `paper` tone is intended for dark backgrounds.

## Feature entry points

Each entry point exports components and their presentation contracts. Open the adjacent stories for fixture data and callback examples. Frame identifiers refer to the current desktop design. The corresponding mobile frames reuse these components.

| Desktop reference | Component area | Import from |
| --- | --- | --- |
| D01 | Landing header, hero, demo, feature sections and footer | `@/features/landing/components` |
| D02–D03, D17–D18 | Upload, confidence review, correction and confirmation | `@/features/inspiration/components` |
| D04 | Wardrobe match and match evidence | `@/features/matching/components` |
| D05, D19 | Outfit directions and regeneration | `@/features/outfits/components` |
| D06 | Outfit details, shopping offers and value weights | `@/features/products` |
| D07–D08, D20–D22 | Wardrobe cards, filters, collection, intake and item detail | `@/features/wardrobe` |
| D09, D29 | Style preferences and workspace profile | `@/features/preferences`, `@/features/profile` |
| D10–D12, D23–D26 | Capsule wizard, collection, results and outfit detail | `@/features/capsules` |
| D13 | Preview picker, canvas and generation status | `@/features/preview` |
| D14, D27 | Saved looks and saved look detail | `@/features/decisions` |
| D15–D16, D28 | Share review, public presentation and unavailable links | `@/features/sharing` |
| D17, D30–D32, R01–R02 | Shell, activity, navigation, confirmation, recovery and loading | `@/components/shell`, `@/components/ui` |

## Media

The 28 individual image assets in `public/design/images` are WebP exports of their Figma library layers. Editorial illustrations and capsule template boards can be used directly. Sample wardrobe photos, avatar examples and marketplace stand-ins belong in labeled demos and stories. Real feature data supplies its own media URLs. The application stores asset identifiers separately from presentation props.

Preferences uses the D09 reference swatches, fit and body illustrations, and five cropped style photographs. The five `body-men-*.svg` silhouettes were drawn for the alternate illustration group listed as outstanding in the design guide. Their options can be replaced through `bodyIllustrations`.
