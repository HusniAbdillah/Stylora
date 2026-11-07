import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  PreviewItemPhoto,
  PreviewStudio,
  type PreviewItem,
  type PreviewJob,
} from "./preview-studio";

const photo = (name: string) => "/design/images/" + name + ".webp";
const items: PreviewItem[] = [
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
    id: "loafers",
    name: "Dark leather loafers",
    category: "shoes",
    imageUrl: photo("wardrobe-dark-loafers"),
    inventoryStatus: "owned",
  },
  {
    id: "tote",
    name: "Oxblood tote",
    category: "accessory",
    subcategory: "tote bag",
    imageUrl: photo("wardrobe-oxblood-tote"),
    inventoryStatus: "owned",
  },
];
const selection = {
  top: "shirt",
  bottom: "trousers",
  shoes: "loafers",
  bags: "tote",
};
const ready: PreviewJob = {
  status: "succeeded",
  imageUrl: photo("avatar-aivory-charcoal"),
  elapsedSeconds: 18,
};

function Demo(args: ComponentProps<typeof PreviewStudio>) {
  const [job, setJob] = useState(args.job);
  const [saved, setSaved] = useState(false);
  return (
    <div className="mx-auto max-w-[1240px] p-4 md:p-8">
      {saved && (
        <p role="status" className="mb-4 rounded-xl bg-blush p-3 text-sm">
          Look saved. Avatar status remains separate.
        </p>
      )}
      <PreviewStudio
        {...args}
        job={job}
        onGenerate={() => setJob(ready)}
        onSaveLook={() => setSaved(true)}
      />
    </div>
  );
}

const meta = {
  title: "Features/Preview Studio",
  component: PreviewStudio,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Illustrative Figma asset library fixture. Generated media in the app comes from a real provider result.",
      },
    },
  },
  args: {
    items,
    initialSelection: selection,
    job: ready,
    profileSummary: {
      swatchLabel: "Depth 04, #B9805D",
      undertone: "Warm",
      bodyReference: "Rectangle, relaxed fit",
      pose: "Relaxed three-quarter stance",
    },
  },
  render: (args) => <Demo {...args} />,
} satisfies Meta<typeof PreviewStudio>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Generating: Story = {
  args: { job: { status: "running", elapsedSeconds: 12 } },
};
export const Failed: Story = {
  args: {
    job: {
      status: "failed",
      errorMessage:
        "The image could not be generated. Your selected pieces are still here.",
    },
  },
};
export const NoInventory: Story = {
  args: { items: [], initialSelection: {}, job: { status: "idle" } },
};
export const NoPreferences: Story = {
  args: { profileSummary: undefined, job: { status: "queued" } },
};
export const ItemThumbnail: Story = {
  render: () => (
    <div className="w-32 p-4">
      <PreviewItemPhoto item={items[0]} sizes="128px" />
    </div>
  ),
};
