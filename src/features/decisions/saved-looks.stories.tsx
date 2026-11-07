import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  SavedLookAvatar,
  SavedLookDetail,
  SavedLooksGallery,
  type SavedLook,
} from "./saved-looks";

const photo = (name: string) => "/design/images/" + name + ".webp";
const shirt = {
  id: "shirt",
  name: "Ivory relaxed shirt",
  category: "top",
  imageUrl: photo("wardrobe-ivory-shirt"),
  status: "owned" as const,
};
const trousers = {
  id: "trousers",
  name: "Charcoal wide-leg trousers",
  category: "bottom",
  imageUrl: photo("wardrobe-charcoal-trousers"),
  status: "owned" as const,
};
const loafers = {
  id: "loafers",
  name: "Dark leather loafers",
  category: "shoes",
  imageUrl: photo("wardrobe-dark-loafers"),
  status: "owned" as const,
};
const tote = {
  id: "tote",
  name: "Oxblood tote",
  category: "accessory",
  imageUrl: photo("wardrobe-oxblood-tote"),
  status: "alternative" as const,
};
const looks: SavedLook[] = [
  {
    id: "ivory",
    title: "Ivory and charcoal",
    subtitle: "Soft tailoring for every day",
    savedAt: "6 November",
    avatarUrl: photo("avatar-aivory-charcoal"),
    mediaStatus: "succeeded",
    items: [shirt, trousers, loafers, tote],
    share: { active: true, expiresLabel: "5 days left" },
  },
  {
    id: "trench",
    title: "Trench and denim",
    subtitle: "Weekend city walk",
    savedAt: "6 November",
    avatarUrl: photo("avatar-btrench-denim"),
    mediaStatus: "succeeded",
    items: [shirt, trousers, loafers],
  },
  {
    id: "striped",
    title: "Striped knit polo",
    subtitle: "Weekend idea",
    savedAt: "just now",
    mediaStatus: "running",
    items: [shirt, trousers, loafers],
  },
  {
    id: "evening",
    title: "Evening slip dress",
    subtitle: "A quiet dinner",
    savedAt: "5 November",
    avatarUrl: photo("avatar-cevening"),
    mediaStatus: "succeeded",
    items: [tote],
  },
  {
    id: "denim",
    title: "Denim and tee",
    subtitle: "City day",
    savedAt: "4 November",
    mediaStatus: "failed",
    items: [shirt, trousers, loafers],
  },
];

function GalleryDemo() {
  const [data, setData] = useState(looks);
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      {opened ? (
        <>
          <button
            type="button"
            onClick={() => setOpened(null)}
            className="mb-4 text-sm text-crimson"
          >
            ← Back to saved looks
          </button>
          <SavedLookDetail
            look={data.find((item) => item.id === opened)!}
            onRetryImage={(id) =>
              setData((current) =>
                current.map((item) =>
                  item.id === id ? { ...item, mediaStatus: "queued" } : item,
                ),
              )
            }
            onShare={(id) => setOpened(id)}
          />
        </>
      ) : (
        <SavedLooksGallery
          looks={data}
          onOpen={setOpened}
          onRetryImage={(id) =>
            setData((current) =>
              current.map((item) =>
                item.id === id ? { ...item, mediaStatus: "queued" } : item,
              ),
            )
          }
        />
      )}
    </div>
  );
}

const meta = {
  title: "Features/Saved looks",
  component: SavedLooksGallery,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Illustrative asset library fixture. Saved snapshots and media status are route supplied.",
      },
    },
  },
  args: { looks },
} satisfies Meta<typeof SavedLooksGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Collection: Story = { render: () => <GalleryDemo /> };
export const EmptyCollection: Story = {
  args: { looks: [] },
  render: (args) => (
    <div className="mx-auto max-w-5xl p-6">
      <SavedLooksGallery {...args} />
    </div>
  ),
};
export const SavedDetail: Story = {
  render: () => (
    <div className="mx-auto max-w-5xl p-6">
      <SavedLookDetail
        look={looks[0]}
        onRetryImage={() => undefined}
        onShare={() => undefined}
        onDelete={() => undefined}
        onAddToCapsule={() => undefined}
      />
    </div>
  ),
};
export const ImageFailed: Story = {
  render: () => (
    <div className="w-64 p-4">
      <SavedLookAvatar look={looks[4]} onRetry={() => undefined} />
    </div>
  ),
};
export const ImagePreparing: Story = {
  render: () => (
    <div className="w-64 p-4">
      <SavedLookAvatar look={looks[2]} />
    </div>
  ),
};
