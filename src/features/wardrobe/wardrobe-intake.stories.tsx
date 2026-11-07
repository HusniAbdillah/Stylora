import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui";
import {
  WardrobeIntake,
  type WardrobeIntakeProps,
  type WardrobeProposal,
} from "./wardrobe-intake";
import { getIntakeFields } from "./wardrobe-intake-draft";

const initialProposals: WardrobeProposal[] = [
  {
    id: "shirt",
    name: "Ivory relaxed shirt",
    category: "top",
    imageUrl: "/design/images/wardrobe-ivory-shirt.webp",
    fields: getIntakeFields([
      {
        key: "color",
        label: "Colors",
        value: "Ivory",
        source: "visual_inference",
      },
      {
        key: "silhouette",
        label: "Silhouette and fit",
        value: "Relaxed button-front shirt",
        source: "visual_inference",
      },
      {
        key: "necklineSleeve",
        label: "Neckline and sleeve",
        value: "Long sleeve",
        source: "visual_inference",
      },
      {
        key: "texture",
        label: "Fabric look",
        value: "Smooth woven appearance",
        source: "visual_inference",
      },
    ]),
  },
];

function IntakeDemo(props: WardrobeIntakeProps) {
  const [open, setOpen] = useState(true);
  const [proposals, setProposals] = useState(props.proposals);
  const [selectedId, setSelectedId] = useState(
    props.selectedProposalId ?? props.proposals[0]?.id,
  );
  const updateProposal = (
    id: string,
    update: (item: WardrobeProposal) => WardrobeProposal,
  ) =>
    setProposals((current) =>
      current.map((item) => (item.id === id ? update(item) : item)),
    );
  return (
    <div style={{ padding: 24 }}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open add piece
      </Button>
      <WardrobeIntake
        {...props}
        open={open}
        proposals={proposals}
        selectedProposalId={selectedId}
        onClose={() => setOpen(false)}
        onSelectProposal={setSelectedId}
        onNameChange={(id, name) =>
          updateProposal(id, (item) => ({ ...item, name }))
        }
        onCategoryChange={(id, category) =>
          updateProposal(id, (item) => ({ ...item, category }))
        }
        onFieldChange={(id, key, value) =>
          updateProposal(id, (item) => ({
            ...item,
            fields: item.fields.map((field) =>
              field.key === key ? { ...field, value, source: "user" } : field,
            ),
          }))
        }
        onConfirm={() => setOpen(false)}
      />
    </div>
  );
}

const meta = {
  title: "Features/Wardrobe/Add piece",
  component: WardrobeIntake,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    status: "ready",
    proposals: initialProposals,
    onClose: () => undefined,
    onPickImage: () => undefined,
    onSelectProposal: () => undefined,
    onNameChange: () => undefined,
    onCategoryChange: () => undefined,
    onFieldChange: () => undefined,
    onConfirm: () => undefined,
  },
} satisfies Meta<typeof WardrobeIntake>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PhotoRead: Story = { render: (args) => <IntakeDemo {...args} /> };
export const EmptyUpload: Story = {
  args: { status: "empty", proposals: [] },
  render: (args) => <IntakeDemo {...args} />,
};
export const DescribingPhoto: Story = {
  args: { status: "analyzing", proposals: [] },
  render: (args) => <IntakeDemo {...args} />,
};
export const TwoGarments: Story = {
  args: {
    proposals: [
      ...initialProposals,
      {
        id: "trousers",
        name: "Charcoal wide-leg trousers",
        category: "bottom",
        imageUrl: "/design/images/wardrobe-charcoal-trousers.webp",
        fields: getIntakeFields([
          {
            key: "color",
            label: "Colors",
            value: "Charcoal",
            source: "visual_inference",
          },
          {
            key: "silhouette",
            label: "Silhouette and fit",
            value: "Wide leg",
            source: "visual_inference",
          },
        ]),
      },
    ],
  },
  render: (args) => <IntakeDemo {...args} />,
};
export const DescriptionFailed: Story = {
  args: {
    status: "error",
    proposals: [],
    errorMessage: "The image could not be described yet.",
    onRetry: () => undefined,
    onManualEntry: () => undefined,
  },
  render: (args) => <IntakeDemo {...args} />,
};
