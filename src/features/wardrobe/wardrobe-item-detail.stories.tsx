import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  WardrobeArchiveDialog,
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
  sourceName: "Uniqlo",
  priceWhenSaved: "$39.90",
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [item, setItem] = useState(props.item);
  return (
    <>
      <WardrobeItemDetail
        {...props}
        item={item}
        onMarkOwned={() =>
          setItem((current) => ({ ...current, inventoryStatus: "owned" }))
        }
        onArchive={() => setArchiveOpen(true)}
      />
      <WardrobeArchiveDialog
        open={archiveOpen}
        itemName={item.name}
        itemImageUrl={item.imageUrl}
        savedLookCount={item.usedIn?.length ?? 0}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          setItem((current) => ({ ...current, archived: true }));
          setArchiveOpen(false);
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
    onReplacePhoto: () => undefined,
    onPreview: () => undefined,
    onEdit: () => undefined,
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
export const ArchivedPiece: Story = {
  args: { item: { ...shirt, archived: true }, onRestore: () => undefined },
};
export const ArchiveConfirmation: Story = {
  render: () => (
    <WardrobeArchiveDialog
      open
      itemName={shirt.name}
      itemImageUrl={shirt.imageUrl}
      savedLookCount={1}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  ),
};
