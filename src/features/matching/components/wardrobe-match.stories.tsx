import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WardrobeMatchView } from "./wardrobe-match";
import type { WardrobeMatch } from "./wardrobe-match";

const mixedMatches: WardrobeMatch[] = [
  {
    id: "match-shirt",
    outcome: "owned_match",
    inspiration: {
      name: "Ivory relaxed shirt",
      category: "Top",
      summary: "Linen-like, relaxed",
    },
    wardrobeItem: {
      id: "wardrobe-shirt",
      name: "Your ivory relaxed shirt",
      imageUrl: "/design/images/wardrobe-ivory-shirt.webp",
    },
    sharedAttributes: ["Ivory", "Relaxed fit", "Point collar", "Long sleeve"],
    differences: ["Yours adds a chest pocket"],
    explanation: "Composition is not verified.",
  },
  {
    id: "match-trousers",
    outcome: "owned_match",
    inspiration: {
      name: "Charcoal wide-leg trousers",
      category: "Bottom",
      summary: "High rise, pleated",
    },
    wardrobeItem: {
      id: "wardrobe-trousers",
      name: "Your charcoal trousers",
      imageUrl: "/design/images/wardrobe-charcoal-trousers.webp",
    },
    sharedAttributes: ["Charcoal", "High rise", "Wide leg", "Full length"],
    explanation: "Pleat depth cannot be confirmed from the reference.",
  },
  {
    id: "match-shoes",
    outcome: "owned_match",
    inspiration: {
      name: "Dark leather loafers",
      category: "Shoes",
      summary: "Penny loafer, low heel",
    },
    wardrobeItem: {
      id: "wardrobe-shoes",
      name: "Dark leather loafers",
      imageUrl: "/design/images/wardrobe-dark-loafers.webp",
    },
    sharedAttributes: ["Dark brown", "Round toe", "Low heel", "Slip-on"],
    explanation: "A close match for a smart casual occasion.",
  },
  {
    id: "match-bag",
    outcome: "wardrobe_alternative",
    inspiration: {
      name: "Brown leather tote",
      category: "Accessory",
      summary: "Soft shoulder tote",
    },
    wardrobeItem: {
      id: "wardrobe-bag",
      name: "Oxblood tote",
      imageUrl: "/design/images/wardrobe-oxblood-tote.webp",
    },
    sharedAttributes: ["Shoulder carry", "Soft structure", "Leather-like"],
    differences: ["Deeper red-brown instead of mid-brown"],
    explanation: "It still repeats the warm palette of the loafers.",
  },
  {
    id: "match-coat",
    outcome: "missing",
    inspiration: {
      name: "Stone trench coat",
      category: "Outerwear",
      summary: "Belted, below the knee",
    },
    missingBrief:
      "Stone trench coat, double-breasted, tie belt, relaxed, below the knee, smart casual.",
    rejectedCandidates: [
      {
        name: "Navy zip hoodie",
        reason: "sport-casual knit is not a tailored outer layer",
        imageUrl: "/design/images/ds-navy-zip-hoodie.webp",
      },
    ],
    shoppingStatus: "running",
  },
];

function MixedResultsStory() {
  const [ideasStatus, setIdeasStatus] = useState<"queued" | "running">(
    "queued",
  );
  return (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <WardrobeMatchView
        matches={mixedMatches}
        ideasStatus={ideasStatus}
        onGenerateIdeas={() => setIdeasStatus("running")}
      />
    </div>
  );
}

const meta = {
  title: "Features/Create/Wardrobe match",
  component: WardrobeMatchView,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WardrobeMatchView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MixedResults: Story = {
  args: { matches: mixedMatches },
  render: () => <MixedResultsStory />,
};
export const EmptyInventory: Story = {
  args: {
    matches: [
      {
        id: "missing-shirt",
        outcome: "missing",
        inspiration: { name: "Ivory relaxed shirt", category: "Top" },
        missingBrief: "Ivory relaxed shirt with a point collar.",
      },
      {
        id: "missing-coat",
        outcome: "missing",
        inspiration: { name: "Stone trench coat", category: "Outerwear" },
        missingBrief: "Stone belted trench coat.",
      },
    ],
  },
  render: (args) => (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <WardrobeMatchView {...args} />
    </div>
  ),
};
export const Loading: Story = {
  args: { matches: [], status: "loading" },
  render: (args) => (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <WardrobeMatchView {...args} />
    </div>
  ),
};
export const ProviderUnavailable: Story = {
  args: {
    matches: [],
    status: "unavailable",
    errorMessage:
      "Matching is unavailable while the provider is not configured.",
  },
  render: (args) => (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <WardrobeMatchView {...args} />
    </div>
  ),
};
