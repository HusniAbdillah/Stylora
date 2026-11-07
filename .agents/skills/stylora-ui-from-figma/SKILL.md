---
name: stylora-ui-from-figma
description: Use when implementing or restyling a Stylora screen or component from the Figma design system. Maps frames onto shared primitives and DESIGN.md tokens, and lists the state, accessibility and copy checks every screen must pass.
---

# Implement a screen from Figma

Figma is the visual source (file named in `docs/DESIGN.md`, pages 03 to 05). Code
output from Figma is a reference to adapt, never final code to paste.

## Steps

1. Find your frame IDs in `docs/WORKFLOW.md` section 4 and the matching row on the
   Handoff notes board (page 03).
2. Get the design context and a screenshot for the frame with the Figma MCP.
3. Map the result onto the shared primitives (Button, Chip, StatusBadge, Stepper,
   Skeleton, ConfirmDialog, Toast, Logo) in `src/components/ui` and the CSS tokens
   from `docs/DESIGN.md`. If a primitive is missing, ask Owner 1 or add it
   through a Lane B pull request. Do not fork a private copy.
4. Build the desktop frame at 1440 px and the mobile frame at 390 px. Compare
   once, side by side, then stop polishing.
5. Real data only: wardrobe matches show real wardrobe images, products come
   from the provider, detected descriptions never invent segmented photos.
   Frame images are reference assets and never ship as data.

## Tokens and components

- No raw hex, no absolute positions. Use token classes and layout utilities.
- Paper text on Crimson primary buttons. Option tabs are light with readable dark
  labels. Follow the component behavior rows in `docs/DESIGN.md`.
- Sentence case. No slash-separated labels. Counts are plain integers.

## Every screen has

- Loading skeleton shaped like the final layout, partial, empty, error and retry.
- Long content that wraps or truncates without breaking layout.
- Keyboard order, visible focus, labels, 44 px touch targets, reduced motion.
- Custom accessible ConfirmDialog for deletion, destructive replacement, edit
  application, draft discard and share revocation. No browser alerts.
- State kept across navigation. No progress-loss warning on normal navigation.

## Do not

Add a component library, icon pack, animation library or font without a Lane B
decision. Do not add login, user ownership or private-data promises to copy.
