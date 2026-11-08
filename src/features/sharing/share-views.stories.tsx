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

function ReviewDemo({
  initialLink = true,
  loading = false,
  initialManaging = false,
}: {
  initialLink?: boolean;
  loading?: boolean;
  initialManaging?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [managing, setManaging] = useState(initialManaging);
  const [description, setDescription] = useState(look.catchphrase ?? "");
  const [url, setUrl] = useState<string | null>(
    initialLink ? "https://stylora.example/shared/sample" : null,
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
        loading={loading}
        managing={managing}
        onCreateNew={() => setManaging(false)}
        catchphrase={description}
        onCatchphraseChange={setDescription}
        onClose={() => setOpen(false)}
        onPublish={() => setUrl("https://stylora.example/shared/sample")}
        onTurnOff={() => {
          setRevokeOpen(true);
        }}
        confirmation={
          revokeOpen
            ? {
                content: (
                  <ShareRevocationDialog
                    open
                    lookTitle={look.title}
                    onClose={() => setRevokeOpen(false)}
                    onRevoke={() => {
                      setUrl(null);
                      setRevoked(true);
                      setRevokeOpen(false);
                    }}
                  />
                ),
                onCancel: () => setRevokeOpen(false),
              }
            : undefined
        }
      >
        {managing && (
          <section className="mt-5 border-t border-stone pt-4">
            <h3 className="text-sm font-medium">Published links</h3>
            <p className="mt-3 text-xs text-crimson">Active until turned off</p>
            <p className="mt-2 text-sm">{look.catchphrase}</p>
            <button
              type="button"
              className="mt-3 min-h-11 text-sm text-crimson"
              onClick={() => setRevokeOpen(true)}
            >
              Turn off link
            </button>
          </section>
        )}
      </ShareReviewDialog>
      {revoked && (
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
export const LegacyExpiringLink: Story = {
  args: { look: { ...look, expiresLabel: "14 November 2026" } },
};
export const ReviewAndRevoke: Story = { render: () => <ReviewDemo /> };
export const ReviewBeforeSharing: Story = {
  render: () => <ReviewDemo initialLink={false} />,
};
export const ReviewLoading: Story = {
  render: () => <ReviewDemo initialLink={false} loading />,
};
export const ManagePublishedLinks: Story = {
  render: () => <ReviewDemo initialLink={false} initialManaging />,
};
export const LinkUnavailable: Story = { render: () => <ShareUnavailable /> };
