import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ActivityMenu,
  MobileTopBar,
  WorkspaceSidebar,
} from "./workspace-navigation";

import { WorkspaceShell } from "./workspace-shell";

const meta = {
  title: "Shell/Navigation",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Responsive: Story = {
  render: () => (
    <>
      <WorkspaceSidebar activeHref="/wardrobe" displayName="Studio guest" />
      <MobileTopBar
        activeHref="/wardrobe"
        displayName="Studio guest"
        activity={<ActivityMenu items={[]} />}
      />
    </>
  ),
};
export const Activity: Story = {
  render: () => (
    <ActivityMenu
      items={[
        { id: "sample-1", label: "Pieces described", state: "complete" },
        { id: "sample-2", label: "Review with confidence", state: "running" },
      ]}
    />
  ),
};

export const Shell: Story = {
  render: () => (
    <WorkspaceShell
      activeHref="/create"
      displayName="Studio guest"
      breadcrumbs={[{ label: "Create", href: "/create" }, { label: "Upload" }]}
      activity={[]}
      draftStatus="saved"
    >
      <div className="rounded-panel bg-surface p-6">
        <h2 className="font-display text-section">Upload inspiration</h2>
      </div>
    </WorkspaceShell>
  ),
};
