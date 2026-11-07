import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WardrobeGrid, type WardrobeGridProps } from "./wardrobe-grid";
import type { WardrobeItemSummary } from "./wardrobe-types";

const image = (name: string) => `/design/images/${name}.webp`;

const items: WardrobeItemSummary[] = [
  {
    id: "shirt",
    name: "Ivory relaxed shirt",
    category: "top",
    imageUrl: image("wardrobe-ivory-shirt"),
    inventoryStatus: "owned",
  },
  {
    id: "trousers",
    name: "Charcoal wide-leg trousers",
    category: "bottom",
    imageUrl: image("wardrobe-charcoal-trousers"),
    inventoryStatus: "owned",
  },
  {
    id: "loafers",
    name: "Dark leather loafers",
    category: "shoes",
    imageUrl: image("wardrobe-dark-loafers"),
    inventoryStatus: "owned",
  },
  {
    id: "skirt",
    name: "Denim midi skirt",
    category: "bottom",
    imageUrl: image("ds-denim-skirt"),
    inventoryStatus: "owned",
  },
  {
    id: "hoodie",
    name: "Navy zip hoodie",
    category: "outerwear",
    imageUrl: image("ds-navy-zip-hoodie"),
    inventoryStatus: "owned",
  },
  {
    id: "dress",
    name: "Pink floral dress",
    category: "dress",
    imageUrl: image("ds-pink-floral-dress"),
    inventoryStatus: "owned",
  },
  {
    id: "tote",
    name: "Oxblood tote",
    category: "accessory",
    imageUrl: image("wardrobe-oxblood-tote"),
    inventoryStatus: "saved_candidate",
  },
];

function ControlledWardrobe({
  items: allItems,
  ...initial
}: WardrobeGridProps) {
  const [category, setCategory] = useState(initial.activeCategory);
  const [filter, setFilter] = useState(initial.inventoryFilter);
  const [query, setQuery] = useState(initial.query);
  const shown = allItems.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      item.inventoryStatus === filter &&
      `${item.name} ${item.subcategory ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <WardrobeGrid
      {...initial}
      items={shown}
      activeCategory={category}
      inventoryFilter={filter}
      query={query}
      onCategoryChange={setCategory}
      onFilterChange={setFilter}
      onQueryChange={setQuery}
    />
  );
}

const meta = {
  title: "Features/Wardrobe/Collection",
  component: WardrobeGrid,
  parameters: { layout: "fullscreen" },
  args: {
    items,
    totalCount: items.length,
    activeCategory: "all",
    inventoryFilter: "owned",
    query: "",
    categoryCounts: {
      top: 1,
      bottom: 2,
      dress: 1,
      outerwear: 1,
      shoes: 1,
      accessory: 1,
    },
    onCategoryChange: () => undefined,
    onFilterChange: () => undefined,
    onQueryChange: () => undefined,
    onAddItem: () => undefined,
    onOpenItem: () => undefined,
  },
} satisfies Meta<typeof WardrobeGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnedCollection: Story = {
  render: (args) => <ControlledWardrobe {...args} />,
};

export const SavedCandidates: Story = {
  args: { inventoryFilter: "saved_candidate" },
  render: (args) => <ControlledWardrobe {...args} />,
};

export const FirstVisit: Story = {
  args: { items: [], totalCount: 0, onUseSample: () => undefined },
};

export const Loading: Story = {
  args: { items: [], status: "loading" },
};

export const EmptySearch: Story = {
  args: { items: [], query: "raincoat" },
};

export const LoadFailed: Story = {
  args: {
    items: [],
    status: "error",
    errorMessage: "The collection could not be loaded.",
    onRetry: () => undefined,
  },
};
