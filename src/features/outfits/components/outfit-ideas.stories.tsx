import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OutfitIdeas } from "./outfit-ideas";
import type { OutfitIdea } from "./outfit-ideas";

const initialIdeas: OutfitIdea[] = [
  {
    id: "idea-closest",
    direction: "closest",
    status: "ready",
    title: "Stone trench over soft tailoring",
    concept:
      "The reference silhouette, rebuilt from three pieces you own and one to find.",
    pieces: [
      { id: "slot-coat", name: "Stone trench coat", status: "missing" },
      {
        id: "slot-shirt",
        name: "Ivory relaxed shirt",
        status: "owned",
        imageUrl: "/design/images/wardrobe-ivory-shirt.webp",
      },
      {
        id: "slot-trousers",
        name: "Charcoal wide-leg trousers",
        status: "owned",
        imageUrl: "/design/images/wardrobe-charcoal-trousers.webp",
      },
      {
        id: "slot-shoes",
        name: "Dark leather loafers",
        status: "owned",
        imageUrl: "/design/images/wardrobe-dark-loafers.webp",
      },
      {
        id: "slot-tote",
        name: "Oxblood tote",
        status: "alternative",
        imageUrl: "/design/images/wardrobe-oxblood-tote.webp",
      },
    ],
    reasons: [
      "The ivory shirt and stone coat keep the light upper half of the reference.",
      "Wide charcoal trousers hold the long column line.",
      "Oxblood tote repeats the loafers for a warm anchor.",
    ],
    inputsUsed: [
      "Reference",
      "Owned wardrobe",
      "Warm undertone",
      "Relaxed fit",
    ],
    differences: ["The tote is a deeper red-brown"],
    uncertainty: [
      "Coat length and fabric weight depend on the product you choose.",
    ],
  },
  {
    id: "idea-owned",
    direction: "from_wardrobe",
    status: "ready",
    title: "Ivory and charcoal, no coat needed",
    concept: "Only pieces you own. Nothing to buy for this version.",
    pieces: [
      {
        id: "slot-shirt",
        name: "Ivory relaxed shirt",
        status: "owned",
        imageUrl: "/design/images/wardrobe-ivory-shirt.webp",
      },
      {
        id: "slot-trousers",
        name: "Charcoal wide-leg trousers",
        status: "owned",
        imageUrl: "/design/images/wardrobe-charcoal-trousers.webp",
      },
      {
        id: "slot-shoes",
        name: "Dark leather loafers",
        status: "owned",
        imageUrl: "/design/images/wardrobe-dark-loafers.webp",
      },
      {
        id: "slot-tote",
        name: "Oxblood tote",
        status: "owned",
        imageUrl: "/design/images/wardrobe-oxblood-tote.webp",
      },
    ],
    reasons: [
      "Same palette and proportions as the reference.",
      "A half tuck adds the waist point the coat used to frame.",
      "Every piece is already in your wardrobe.",
    ],
    inputsUsed: ["Reference", "Owned wardrobe"],
    differences: ["Without a long layer the vertical line is shorter"],
    uncertainty: ["Fit is not verified from images."],
  },
  {
    id: "idea-fresh",
    direction: "fresh_alternative",
    status: "ready",
    title: "Striped knit polo, softer weekend",
    concept:
      "Changes the top and adds a knit layer for a relaxed weekend mood.",
    pieces: [
      {
        id: "slot-polo",
        name: "Brown stripe polo",
        status: "owned",
        imageUrl: "/design/images/ds-brown-stripe-polo.webp",
      },
      {
        id: "slot-trousers",
        name: "Charcoal wide-leg trousers",
        status: "owned",
        imageUrl: "/design/images/wardrobe-charcoal-trousers.webp",
      },
      {
        id: "slot-shoes",
        name: "Dark leather loafers",
        status: "owned",
        imageUrl: "/design/images/wardrobe-dark-loafers.webp",
      },
      { id: "slot-cardigan", name: "Camel knit cardigan", status: "missing" },
    ],
    reasons: [
      "The brown stripe repeats the loafers and suits a warm undertone.",
      "A camel cardigan replaces the coat as a softer outer layer.",
      "Relaxed fit throughout matches your fit goal.",
    ],
    inputsUsed: [
      "Reference",
      "Owned wardrobe",
      "Warm undertone",
      "Relaxed fit",
    ],
    differences: ["A less formal weekend direction"],
    uncertainty: ["Polo collar shape is not visible in the reference."],
  },
];

function InteractiveIdeas() {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const regenerate = (idea: OutfitIdea) => {
    if (timer.current) window.clearTimeout(timer.current);
    setIdeas((current) =>
      current.map((item) =>
        item.id === idea.id ? { ...item, status: "regenerating" } : item,
      ),
    );
    timer.current = window.setTimeout(() => {
      setIdeas((current) =>
        current.map((item) =>
          item.id === idea.id
            ? {
                ...item,
                status: "ready",
                title: `${item.title ?? "Outfit"}, refreshed`,
                differences: [
                  ...(item.differences ?? []),
                  "This sample regeneration changes the styling emphasis",
                ],
              }
            : item,
        ),
      );
      timer.current = null;
    }, 1800);
  };
  return (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <OutfitIdeas
        ideas={ideas}
        preferencesUsed={[
          "Warm undertone",
          "Skin depth 04",
          "Relaxed fit",
          "Everyday",
        ]}
        onViewDetails={(idea) => setSelectedMessage(`Selected: ${idea.title}`)}
        onSuggestAnother={regenerate}
        onCancelRegeneration={(idea) => {
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = null;
          setIdeas((current) =>
            current.map((item) =>
              item.id === idea.id ? { ...item, status: "ready" } : item,
            ),
          );
        }}
      />
      {selectedMessage && (
        <p
          className="mx-auto mt-4 max-w-[1150px] rounded-xl bg-blush p-4 text-sm text-crimson"
          role="status"
        >
          {selectedMessage}
        </p>
      )}
    </div>
  );
}

const meta = {
  title: "Features/Create/Outfit ideas",
  component: OutfitIdeas,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof OutfitIdeas>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ThreeDirections: Story = {
  args: { ideas: initialIdeas },
  render: () => <InteractiveIdeas />,
};
export const RegenerationAndEmptyWardrobe: Story = {
  args: {
    ideas: [
      { ...initialIdeas[0], status: "regenerating" },
      {
        id: "idea-owned",
        direction: "from_wardrobe",
        status: "unavailable",
        pieces: [],
        reasons: [],
        errorMessage:
          "Add a few pieces you own to discover more ways to wear this look.",
      },
      initialIdeas[2],
    ],
    hasPreferences: false,
  },
  render: (args) => (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <OutfitIdeas {...args} />
    </div>
  ),
};
export const Loading: Story = {
  args: { ideas: [], status: "loading" },
  render: (args) => (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <OutfitIdeas {...args} />
    </div>
  ),
};
