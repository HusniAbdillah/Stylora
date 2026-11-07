import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ProfileOverview, type ProfileOverviewProps } from "./profile-overview";

function ControlledProfile(props: ProfileOverviewProps) {
  const [name, setName] = useState(props.displayName);
  const [saved, setSaved] = useState(false);
  return (
    <ProfileOverview
      {...props}
      displayName={name}
      status={saved ? "saved" : props.status}
      onDisplayNameChange={(next) => {
        setName(next);
        setSaved(false);
      }}
      onSaveName={() => setSaved(true)}
    />
  );
}

const meta = {
  title: "Features/Profile/Workspace overview",
  component: ProfileOverview,
  parameters: { layout: "fullscreen" },
  args: {
    displayName: "Studio guest",
    stats: {
      wardrobeItems: 5,
      savedCandidates: 1,
      archivedItems: 1,
    },
    onDisplayNameChange: () => undefined,
    onSaveName: () => undefined,
  },
} satisfies Meta<typeof ProfileOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Workspace: Story = {
  render: (args) => <ControlledProfile {...args} />,
};
export const EmptyWorkspace: Story = {
  args: {
    stats: {
      wardrobeItems: 0,
      savedCandidates: 0,
      archivedItems: 0,
    },
  },
  render: (args) => <ControlledProfile {...args} />,
};
export const Loading: Story = { args: { status: "loading" } };
export const LoadFailed: Story = {
  args: {
    status: "error",
    errorMessage: "The workspace could not be loaded.",
    onRetry: () => undefined,
  },
};
