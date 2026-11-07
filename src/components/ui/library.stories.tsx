import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Badge,
  Button,
  Chip,
  ConfirmDialog,
  Icon,
  LoadingLayout,
  Logo,
  RecoveryPanel,
  SelectField,
  StateNotice,
  Stepper,
  Toast,
  iconNames,
} from "./index";

const meta = { title: "Foundations/Components" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function ControlsExample() {
  const [selected, setSelected] = useState(false);
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState(false);
  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-center gap-4">
        {(["primary", "secondary", "quiet"] as const).map((v) => (
          <Button key={v} variant={v} onClick={() => setOpen(true)}>
            Archive item
          </Button>
        ))}
        <Button disabled>Unavailable</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Chip selected={selected} onClick={() => setSelected(!selected)}>
          Outerwear
        </Chip>
        <Badge tone="owned">In your wardrobe</Badge>
        <Badge tone="alternative">Alternative</Badge>
        <Badge tone="missing">Missing</Badge>
      </div>
      <div className="max-w-xs">
        <SelectField label="Category" defaultValue="outerwear">
          <option value="top">Tops</option>
          <option value="bottom">Bottoms</option>
          <option value="outerwear">Outerwear</option>
        </SelectField>
      </div>
      <ConfirmDialog
        open={open}
        title="Archive relaxed belted trench?"
        description="It will leave your active wardrobe. You can restore it from archived items."
        confirmLabel="Archive item"
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          setArchived(true);
        }}
      />
      {archived && (
        <Toast title="Item archived" onDismiss={() => setArchived(false)}>
          Relaxed belted trench
        </Toast>
      )}
    </div>
  );
}
export const Controls: Story = { render: () => <ControlsExample /> };
export const Icons: Story = {
  render: () => (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
      {iconNames.map((name) => (
        <div
          key={name}
          className="flex flex-col items-center gap-2 rounded-card bg-paper p-4"
        >
          <Icon name={name} size={24} />
          <small>{name}</small>
        </div>
      ))}
    </div>
  ),
};
export const Brand: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-6">
      <Logo />
      <Logo tone="night" />
      <div className="rounded-field bg-night p-2">
        <Logo tone="paper" />
      </div>
      <Logo markOnly />
    </div>
  ),
};
function StepsExample() {
  const [index, setIndex] = useState(2);
  return <Stepper current={index} visited={[0, 1, 2]} onSelect={setIndex} />;
}
export const CreateSteps: Story = { render: () => <StepsExample /> };
export const Feedback: Story = {
  render: () => (
    <div className="grid max-w-3xl gap-6">
      <RecoveryPanel
        kind="error"
        title="Something went wrong on our side"
        message="Try again, or return to your last step."
        action={<Button>Try again</Button>}
      />
      <StateNotice
        title="Review with confidence is unavailable"
        action={<Button variant="secondary">Retry analysis</Button>}
      >
        Your piece descriptions are ready.
      </StateNotice>
      {(
        [
          "upload",
          "review",
          "matches",
          "ideas",
          "shopping",
          "wardrobe",
          "preview",
        ] as const
      ).map((kind) => (
        <LoadingLayout key={kind} kind={kind} />
      ))}
    </div>
  ),
};
