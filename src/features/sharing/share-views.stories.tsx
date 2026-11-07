import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  PublicShare,
  ShareReviewDialog,
  ShareRevocationDialog,
  ShareUnavailable,
  type PublicLook,
} from "./share-views";

const photo = (name: string) => "/design/images/" + name + ".webp";
const look: PublicLook = {
  title: "Ivory and charcoal",
  catchphrase: "Soft tailoring for an easy Friday.",
  avatarUrl: photo("avatar-aivory-charcoal"),
  expiresLabel: "14 November 2026",
  items: [
    {
      id: "shirt",
      name: "Ivory relaxed shirt",
      imageUrl: photo("wardrobe-ivory-shirt"),
    },
    {
      id: "trousers",
      name: "Charcoal wide-leg trousers",
      imageUrl: photo("wardrobe-charcoal-trousers"),
    },
    {
      id: "loafers",
      name: "Dark leather loafers",
      imageUrl: photo("wardrobe-dark-loafers"),
    },
    {
      id: "tote",
      name: "Oxblood tote",
      imageUrl: photo("wardrobe-oxblood-tote"),
    },
  ],
};

function ReviewDemo() {
  const [open, setOpen] = useState(true);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(
    "https://stylora.example/shared/sample",
  );
  return (
    <div className="p-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-crimson px-4 py-3 text-paper"
      >
        Open share review
      </button>
      <ShareReviewDialog
        open={open}
        look={look}
        shareUrl={url}
        initialCatchphrase={look.catchphrase ?? ""}
        onClose={() => setOpen(false)}
        onPublish={() => setUrl("https://stylora.example/shared/sample")}
        onTurnOff={() => {
          setOpen(false);
          setRevokeOpen(true);
        }}
      />
      <ShareRevocationDialog
        open={revokeOpen}
        lookTitle={look.title}
        onClose={() => setRevokeOpen(false)}
        onRevoke={() => {
          setUrl(null);
          setRevokeOpen(false);
        }}
      />
      {!url && (
        <p role="status" className="mt-4 text-sm">
          Sample link turned off.
        </p>
      )}
    </div>
  );
}

const meta = {
  title: "Features/Sharing",
  component: PublicShare,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Illustrative share projection. Real public media and token checks must come from the server.",
      },
    },
  },
  args: { look },
} satisfies Meta<typeof PublicShare>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PublicPage: Story = {};
export const ReviewAndRevoke: Story = { render: () => <ReviewDemo /> };
export const LinkUnavailable: Story = { render: () => <ShareUnavailable /> };
