import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CAPSULE_TEMPLATES,
  EMPTY_CAPSULE_DRAFT,
  type CapsuleDraft,
  type CapsuleItem,
  type CapsuleResult,
} from "./capsule-types";
import { CapsuleTemplateCard, CapsuleWizard } from "./capsule-wizard";
import {
  CapsuleCollection,
  CapsuleOutfitDetail,
  CapsuleResults,
} from "./capsule-results";

const photo = (name: string) => "/design/images/" + name + ".webp";
const pieces: CapsuleItem[] = [
  {
    id: "shirt",
    name: "Ivory relaxed shirt",
    category: "top",
    imageUrl: photo("wardrobe-ivory-shirt"),
    inventoryStatus: "owned",
  },
  {
    id: "polo",
    name: "Brown stripe polo",
    category: "top",
    imageUrl: photo("ds-brown-stripe-polo"),
    inventoryStatus: "owned",
  },
  {
    id: "tee",
    name: "White graphic tee",
    category: "top",
    imageUrl: photo("ds-white-graphic-tee"),
    inventoryStatus: "owned",
  },
  {
    id: "trousers",
    name: "Charcoal wide-leg trousers",
    category: "bottom",
    imageUrl: photo("wardrobe-charcoal-trousers"),
    inventoryStatus: "owned",
  },
  {
    id: "skirt",
    name: "Denim skirt",
    category: "bottom",
    imageUrl: photo("ds-denim-skirt"),
    inventoryStatus: "owned",
  },
  {
    id: "loafers",
    name: "Dark leather loafers",
    category: "shoes",
    imageUrl: photo("wardrobe-dark-loafers"),
    inventoryStatus: "owned",
  },
  {
    id: "trainers",
    name: "Grey trail runners",
    category: "shoes",
    imageUrl: photo("ds-grey-trail-runner"),
    inventoryStatus: "owned",
  },
  {
    id: "tote",
    name: "Oxblood tote",
    category: "accessory",
    imageUrl: photo("wardrobe-oxblood-tote"),
    inventoryStatus: "owned",
  },
  {
    id: "hoodie",
    name: "Navy zip hoodie",
    category: "outerwear",
    imageUrl: photo("ds-navy-zip-hoodie"),
    inventoryStatus: "owned",
  },
];
const draft: CapsuleDraft = {
  ...EMPTY_CAPSULE_DRAFT,
  templateId: "weekend-travel",
  days: 3,
  targetOutfits: 4,
  activities: ["City walks", "Dinner out", "Museums"],
  weather: "Cool evenings",
  laundry: "No laundry",
  notes:
    "One dinner at a restaurant with a smart casual dress code. Comfortable shoes for walking.",
  palette: "Warm neutrals",
  dressCode: "Smart casual",
  luggage: "Carry-on",
  footwear: "Walkable flats",
  coverage: "No preference",
  care: "Easy care",
  includedItemIds: pieces
    .map((item) => item.id)
    .filter((id) => id !== "hoodie"),
  requiredItemIds: ["shirt"],
  excludedItemIds: ["hoodie"],
};
const capsule: CapsuleResult = {
  id: "weekend",
  title: "Weekend travel, Bandung",
  subtitle: "Weekend travel, 3 days",
  templateId: "weekend-travel",
  pieces: pieces.filter((item) => item.id !== "hoodie"),
  outfits: [
    {
      id: "city",
      title: "City walking day",
      occasion: "City walks",
      items: [pieces[2], pieces[4], pieces[6], pieces[7]],
      reasons: [
        "Denim and a white tee keep it light for long walks.",
        "The tote carries a day of museum stops.",
      ],
      inputsUsed: ["City walks", "Walkable flats"],
    },
    {
      id: "dinner",
      title: "Dinner, smart casual",
      occasion: "Dinner out",
      items: [pieces[0], pieces[3], pieces[5], pieces[7]],
      reasons: [
        "Ivory and charcoal meet the dress code without a blazer.",
        "Loafers stay comfortable for the walk back.",
      ],
      inputsUsed: ["Dinner out", "Warm undertone", "Relaxed fit"],
    },
    {
      id: "museum",
      title: "Museum afternoon",
      occasion: "Museums",
      items: [pieces[1], pieces[3], pieces[5]],
      reasons: [
        "The striped knit adds texture to repeated trousers.",
        "Brown stripe echoes the loafers for a warm palette.",
      ],
      inputsUsed: ["Museums"],
    },
    {
      id: "rain",
      title: "Rainy afternoon layer",
      occasion: "City walks",
      items: [pieces[2], pieces[4], pieces[5]],
      reasons: [
        "A trench over denim and a tee covers the cool evening and chance of rain.",
      ],
      requiresAddition: true,
      inputsUsed: ["Cool evenings"],
    },
  ],
  additions: [
    {
      id: "trench",
      name: "Trench coat",
      imageUrl: photo("product-trench1"),
      brief:
        "It fills the only role your wardrobe lacks, a long light layer, and works with pieces you already own.",
      unlockedOutfitIds: ["rain", "dinner", "museum"],
      supportingItemNames: [
        "Ivory shirt and charcoal trousers",
        "White tee and denim skirt",
        "Brown stripe polo and trousers",
      ],
    },
  ],
};

const meta = {
  title: "Features/Capsule Studio",
  component: CapsuleWizard,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Illustrative Figma asset library fixture. Capsule generation uses owned item IDs and text, never inventory photos.",
      },
    },
  },
  args: {
    ownedItems: pieces,
    initialDraft: draft,
    initialStep: 0,
    profileSummary: ["Warm undertone, depth 04", "Rectangle, relaxed fit"],
  },
} satisfies Meta<typeof CapsuleWizard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TemplateStep: Story = {
  render: (args) => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleWizard {...args} />
    </div>
  ),
};
export const PurposeStep: Story = {
  args: { initialStep: 1 },
  render: (args) => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleWizard {...args} />
    </div>
  ),
};
export const StyleStep: Story = {
  args: { initialStep: 2 },
  render: (args) => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleWizard {...args} />
    </div>
  ),
};
export const ItemsStep: Story = {
  args: { initialStep: 3 },
  render: (args) => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleWizard {...args} />
    </div>
  ),
};
export const ItemsWithoutInventory: Story = {
  args: { initialStep: 3, ownedItems: [] },
  render: (args) => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleWizard {...args} />
    </div>
  ),
};
export const TemplateCard: Story = {
  render: () => (
    <div className="w-48 p-4">
      <CapsuleTemplateCard template={CAPSULE_TEMPLATES[2]} selected />
    </div>
  ),
};
export const Collection: Story = {
  render: () => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleCollection
        onDelete={() => undefined}
        capsules={[
          capsule,
          {
            ...capsule,
            id: "work",
            title: "Modern workweek",
            templateId: "modern-workweek",
          },
          {
            ...capsule,
            id: "draft",
            title: "Evening versatility",
            templateId: "evening",
            isDraft: true,
          },
        ]}
      />
    </div>
  ),
};
export const Results: Story = {
  render: () => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleResults result={capsule} />
    </div>
  ),
};
export const NoOwnedOutfits: Story = {
  render: () => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleResults result={{ ...capsule, outfits: [], additions: [] }} />
    </div>
  ),
};
export const OutfitDetail: Story = {
  render: () => (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      <CapsuleOutfitDetail
        outfit={capsule.outfits[1]}
        onDelete={() => undefined}
        index={2}
        total={4}
        avatarUrl={photo("avatar-aivory-charcoal")}
      />
    </div>
  ),
};
