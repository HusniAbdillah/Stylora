import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui";
import {
  WardrobeDeleteDialog,
  WardrobeItemDetail,
  type WardrobeItemDetailData,
  type WardrobeItemDetailProps,
} from "./wardrobe-item-detail";

const shirt: WardrobeItemDetailData = {
  id: "shirt",
  name: "Ivory relaxed shirt",
  category: "top",
  subcategory: "Button-front shirt",
  inventoryStatus: "owned",
  imageUrl: "/design/images/wardrobe-ivory-shirt.webp",
  fields: [
    {
      key: "color",
      label: "Color",
      value: "Ivory",
      source: "visual_inference",
    },
    {
      key: "silhouette",
      label: "Silhouette",
      value: "Relaxed",
      source: "visual_inference",
    },
    {
      key: "sleeve",
      label: "Sleeves",
      value: "Long",
      source: "visual_inference",
    },
    {
      key: "fabric",
      label: "Visible texture",
      value: "Smooth woven appearance",
      source: "visual_inference",
    },
  ],
  usedIn: [
    {
      id: "ivory-look",
      title: "Ivory and charcoal",
      imageUrls: [
        "/design/images/wardrobe-ivory-shirt.webp",
        "/design/images/wardrobe-charcoal-trousers.webp",
      ],
    },
  ],
};

const candidate: WardrobeItemDetailData = {
  id: "tote",
  name: "Oxblood structured tote",
  category: "accessory",
  subcategory: "Tote",
  inventoryStatus: "saved_candidate",
  sourceName: "Shopee",
  marketplace: {
    sourceName: "Shopee",
    priceMinor: 29900000,
    currency: "IDR",
    rating: 4.7,
    reviewCount: 121,
    url: "https://www.google.com/shopping/product/123",
    retrievedAt: "2026-11-07T00:00:00Z",
  },
  imageUrl: "/design/images/wardrobe-oxblood-tote.webp",
  fields: [
    { key: "color", label: "Color", value: "Oxblood", source: "catalog" },
    {
      key: "shape",
      label: "Shape",
      value: "Structured tote",
      source: "catalog",
    },
  ],
};

function DetailDemo(props: WardrobeItemDetailProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [saved, setSaved] = useState(props.item);
  const [item, setItem] = useState(props.item);
  if (deleted)
    return (
      <section className="p-8">
        <p>Item deleted.</p>
        <Button onClick={() => setDeleted(false)}>Reset example</Button>
      </section>
    );
  return (
    <>
      <WardrobeItemDetail
        {...props}
        item={item}
        onMarkOwned={() =>
          setItem((current) => ({ ...current, inventoryStatus: "owned" }))
        }
        onNameChange={(name) => setItem((current) => ({ ...current, name }))}
        onCategoryChange={(category) =>
          setItem((current) => ({ ...current, category }))
        }
        onSubcategoryChange={(subcategory) =>
          setItem((current) => ({ ...current, subcategory }))
        }
        onFieldChange={(key, value) =>
          setItem((current) => ({
            ...current,
            fields: current.fields.map((field) =>
              field.key === key ? { ...field, value, source: "user" } : field,
            ),
          }))
        }
        onSave={() => setSaved(item)}
        saveDisabled={JSON.stringify(item) === JSON.stringify(saved)}
        onDelete={() => setDeleteOpen(true)}
      />
      <WardrobeDeleteDialog
        open={deleteOpen}
        itemName={item.name}
        itemImageUrl={item.imageUrl}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleted(true);
          setDeleteOpen(false);
        }}
      />
    </>
  );
}

const meta = {
  title: "Features/Wardrobe/Item detail",
  component: WardrobeItemDetail,
  parameters: { layout: "fullscreen" },
  args: {
    item: shirt,
    onBack: () => undefined,
    onPreview: () => undefined,
    onSave: () => undefined,
    onOpenSavedLook: () => undefined,
  },
} satisfies Meta<typeof WardrobeItemDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OwnedPiece: Story = { render: (args) => <DetailDemo {...args} /> };
export const SavedCandidate: Story = {
  args: { item: candidate },
  render: (args) => <DetailDemo {...args} />,
};
export const DeleteConfirmation: Story = {
  render: () => (
    <WardrobeDeleteDialog
      open
      itemName={shirt.name}
      itemImageUrl={shirt.imageUrl}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  ),
};
