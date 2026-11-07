import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  OutfitDetail,
  ProductCard,
  ShoppingSection,
  type OutfitDetailOption,
  type ProductOffer,
  type ShoppingSlot,
} from "./outfit-detail";

const photo = (name: string) => "/design/images/" + name + ".webp";

const offers: ProductOffer[] = [
  {
    id: "trench-stone",
    title: "Double-breasted gabardine trench, stone",
    seller: "Zalora Indonesia",
    url: "https://example.com/stone-trench",
    imageUrl: photo("product-trench1"),
    priceMinor: 129900000,
    currency: "IDR",
    rating: 4.6,
    reviewCount: 128,
    valueScore: 0.84,
    valueFactors: { price: 0.68, rating: 0.92, relevance: 0.89 },
    scoreVersion: "v1",
  },
  {
    id: "trench-beige",
    title: "Relaxed belted trench coat, beige",
    seller: "Uniqlo",
    url: "https://example.com/beige-trench",
    imageUrl: photo("product-trench2"),
    priceMinor: 99900000,
    currency: "IDR",
    rating: 4.4,
    reviewCount: 2310,
    valueScore: 0.81,
    valueFactors: { price: 0.78, rating: 0.88, relevance: 0.83 },
    scoreVersion: "v1",
    savedCandidate: true,
  },
  {
    id: "trench-taupe",
    title: "Lightweight long mac coat, taupe",
    seller: "Pomelo",
    url: "https://example.com/taupe-trench",
    imageUrl: photo("product-trench3"),
    priceMinor: 74900000,
    currency: "IDR",
    rating: null,
    valueScore: 0.62,
    valueFactors: { price: 0.9, rating: null, relevance: 0.54 },
    scoreVersion: "v1",
  },
];

const baseItems = [
  {
    id: "coat",
    name: "Relaxed belted trench",
    category: "outerwear",
    status: "missing" as const,
    imageUrl: photo("product-trench2"),
  },
  {
    id: "shirt",
    name: "Ivory relaxed shirt",
    category: "top",
    status: "owned" as const,
    imageUrl: photo("wardrobe-ivory-shirt"),
  },
  {
    id: "trousers",
    name: "Charcoal wide-leg trousers",
    category: "bottom",
    status: "owned" as const,
    imageUrl: photo("wardrobe-charcoal-trousers"),
  },
  {
    id: "loafers",
    name: "Dark leather loafers",
    category: "shoes",
    status: "owned" as const,
    imageUrl: photo("wardrobe-dark-loafers"),
  },
  {
    id: "tote",
    name: "Oxblood tote",
    category: "accessory",
    status: "alternative" as const,
    imageUrl: photo("wardrobe-oxblood-tote"),
  },
];

const baseOption: OutfitDetailOption = {
  id: "closest",
  type: "closest",
  title: "Stone trench over soft tailoring.",
  subtitle:
    "Three pieces you own, one alternative and one piece to find. Shopping results stay here when you switch ideas.",
  items: baseItems,
  reasons: [
    "The ivory shirt and stone coat keep the light upper half of the reference.",
    "Wide charcoal trousers hold the long column line from the photo.",
    "The oxblood tote repeats the loafers, a warm anchor for your undertone.",
  ],
  inputsUsed: [
    "Reference",
    "Wardrobe",
    "Warm undertone",
    "Relaxed fit",
    "Everyday",
  ],
  differences: ["Your tote is deeper red-brown than the reference bag."],
  uncertainty: [
    "Coat fit and fabric weight depend on the seller and are not verified.",
  ],
  shoppingSlots: [
    {
      id: "missing-coat",
      name: "Trench coat",
      brief: "Stone trench coat, double-breasted, tie belt, below the knee",
      status: "ready",
      offers,
      source: "Google Shopping via SerpAPI",
      retrievedAt: "2 minutes ago",
    },
  ],
};

const options: OutfitDetailOption[] = [
  baseOption,
  {
    ...baseOption,
    id: "wardrobe",
    type: "from_wardrobe",
    title: "Relaxed layers from your wardrobe.",
    subtitle: "Nothing to buy.",
    items: baseItems.filter((item) => item.status !== "missing"),
    shoppingSlots: [],
    reasons: [
      "Your ivory shirt and charcoal trousers already form the core of the look.",
    ],
    inputsUsed: ["Wardrobe"],
  },
  {
    ...baseOption,
    id: "fresh",
    type: "fresh_alternative",
    title: "A softer weekend direction.",
    subtitle: "A deliberate change in texture and color.",
    shoppingSlots: [
      {
        ...baseOption.shoppingSlots[0],
        id: "fresh-coat",
        status: "loading",
        offers: [],
      },
    ],
  },
];

function Demo(args: ComponentProps<typeof OutfitDetail>) {
  const [data, setData] = useState(args.options);
  const [saved, setSaved] = useState(false);
  function updateSlot(
    slotId: string,
    update: (slot: ShoppingSlot) => ShoppingSlot,
  ) {
    setData((current) =>
      current.map((option) => ({
        ...option,
        shoppingSlots: option.shoppingSlots.map((slot) =>
          slot.id === slotId ? update(slot) : slot,
        ),
      })),
    );
  }
  return (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      {saved && (
        <p role="status" className="mb-4 rounded-xl bg-blush p-3 text-sm">
          Look saved. Avatar preparation is a separate step.
        </p>
      )}
      <OutfitDetail
        {...args}
        options={data}
        onSaveLook={() => setSaved(true)}
        onSaveProduct={(offer, slotId) =>
          updateSlot(slotId, (slot) => ({
            ...slot,
            offers: slot.offers.map((item) =>
              item.id === offer.id ? { ...item, savedCandidate: true } : item,
            ),
          }))
        }
        onChooseProduct={(offer, slotId) =>
          updateSlot(slotId, (slot) => ({ ...slot, selectedOfferId: offer.id }))
        }
        onRetrySearch={(slotId) =>
          updateSlot(slotId, (slot) => ({ ...slot, status: "ready", offers }))
        }
      />
    </div>
  );
}

const meta = {
  title: "Features/Outfit detail and shopping",
  component: OutfitDetail,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Illustrative Figma asset library fixture. Real wardrobe, product and provider data must be supplied by a route.",
      },
    },
  },
  args: { options },
  render: (args) => <Demo {...args} />,
} satisfies Meta<typeof OutfitDetail>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const SearchLoading: Story = {
  args: {
    options: [
      {
        ...baseOption,
        shoppingSlots: [
          { ...baseOption.shoppingSlots[0], status: "loading", offers: [] },
        ],
      },
    ],
  },
};
export const SearchFailed: Story = {
  args: {
    options: [
      {
        ...baseOption,
        shoppingSlots: [
          { ...baseOption.shoppingSlots[0], status: "error", offers: [] },
        ],
      },
    ],
  },
};
export const NoMissingPieces: Story = { args: { options: [options[1]] } };
export const ProductCardSelected: Story = {
  render: () => (
    <div className="w-60 p-4">
      <ProductCard
        offer={offers[0]}
        selected
        onSave={() => undefined}
        onChoose={() => undefined}
      />
    </div>
  ),
};
export const ShoppingSlotPartial: Story = {
  render: () => (
    <div className="max-w-3xl p-4">
      <ShoppingSection
        slot={{ ...baseOption.shoppingSlots[0], offers: offers.slice(0, 1) }}
        weights={{ price: 30, rating: 20, relevance: 50 }}
      />
    </div>
  ),
};
