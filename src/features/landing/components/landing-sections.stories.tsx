import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  LandingAbout,
  LandingCallToAction,
  LandingDemo,
  LandingFeatures,
  LandingFooter,
  LandingHeader,
  LandingHero,
  LandingSteps,
} from ".";
import type { LandingLinks } from "./landing-sections";

const links: LandingLinks = {
  createHref: "#start",
  sampleHref: "#demo",
  wardrobeHref: "#features",
  capsulesHref: "#features",
  previewHref: "#features",
  savedLooksHref: "#features",
  preferencesHref: "#features",
};

function LandingComposition() {
  return (
    <div id="top" className="min-h-screen bg-porcelain text-ink">
      <LandingHeader links={links} homeHref="#top" />
      <div id="demo">
        <LandingHero
          createHref={links.createHref}
          sampleHref={links.sampleHref}
        />
      </div>
      <LandingSteps />
      <div id="features">
        <LandingFeatures
          wardrobeHref={links.wardrobeHref}
          capsulesHref={links.capsulesHref}
          previewHref={links.previewHref}
          savedLooksHref={links.savedLooksHref}
        />
      </div>
      <LandingAbout />
      <div id="start">
        <LandingCallToAction createHref={links.createHref} />
      </div>
      <LandingFooter />
    </div>
  );
}

const meta = {
  title: "Features/Landing",
  component: LandingComposition,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LandingComposition>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteLanding: Story = {};

export const DemoControls: Story = {
  render: () => (
    <div className="min-h-screen bg-porcelain p-5 sm:p-10">
      <p className="mx-auto mb-6 max-w-[580px] text-sm text-secondary">
        Pause, play or choose a step. The demo uses prepared sample data and
        makes no provider request.
      </p>
      <LandingDemo />
    </div>
  ),
};
