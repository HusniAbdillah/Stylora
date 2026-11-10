import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { publishFeedback, type FeedbackState } from "@/lib/feedback/store";
import { ActivityMenu } from "@/components/shell/workspace-navigation";
import { FeedbackViewport } from "./notification-center";
import { Button } from "./primitives";

const meta = {
  title: "Foundations/Notifications",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
function Example() {
  function show(state: FeedbackState) {
    publishFeedback({
      id: "sample-notification",
      label: "Sample preview image",
      state,
      detail:
        state === "failed"
          ? "Sample failure. Retry to see the loading state."
          : state === "complete"
            ? "Sample image ready. This is a UI fixture."
            : "Sample task stage. No provider is called.",
      onRetry: state === "failed" ? () => show("running") : undefined,
    });
  }
  return (
    <main className="min-h-dvh bg-porcelain p-6 text-ink">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-page">Notification examples</h1>
        <ActivityMenu items={[]} />
      </div>
      <p className="my-5 max-w-xl text-secondary">
        Progress stays in Activity. This surface only announces a completed or
        failed task, one at a time. These fixtures make no API requests or
        provider calls.
      </p>
      <div className="flex max-w-2xl flex-wrap gap-3">
        {(
          [
            "queued",
            "running",
            "partial",
            "complete",
            "failed",
            "cancelled",
            "superseded",
          ] as const
        ).map((state) => (
          <Button key={state} variant="secondary" onClick={() => show(state)}>
            {state.charAt(0).toUpperCase() + state.slice(1)}
          </Button>
        ))}
        <Button
          onClick={() =>
            publishFeedback({
              id: crypto.randomUUID(),
              label: "Sample concurrent task",
              state: "running",
              detail: "This sample task stays visible until dismissed.",
            })
          }
        >
          Add concurrent task
        </Button>
        <Button
          variant="quiet"
          onClick={() =>
            publishFeedback({
              id: "long-sample",
              label:
                "Sample outfit saved with a long descriptive title that wraps within the card",
              state: "failed",
              detail:
                "The outfit was saved, but its avatar image could not finish. Your saved snapshot is still available. Open the outfit to review image retry options.",
            })
          }
        >
          Long message
        </Button>
      </div>
      <FeedbackViewport />
    </main>
  );
}
export const Lifecycle: Story = { render: () => <Example /> };
