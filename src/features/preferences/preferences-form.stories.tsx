import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PreferencesForm, type PreferencesFormProps } from "./preferences-form";
import { skinSwatchOptions, type PreferencesDraft } from "./preferences-types";

const sample: PreferencesDraft = {
  skinSwatchId: "depth_03",
  skinSwatchHex: skinSwatchOptions[2].hex,
  undertone: "warm",
  contrast: "medium",
  bodyIllustrationGroup: "women",
  bodyIllustrationId: "hourglass",
  fit: "relaxed",
  styles: ["relaxed_minimal", "smart_tailoring"],
  colorFamilies: ["Warm neutrals", "Earth tones"],
  climate: ["Hot and humid"],
  occasions: ["Work", "Travel"],
  footwearComfort: ["Flats only"],
};

function ControlledPreferences(props: PreferencesFormProps) {
  const [value, setValue] = useState(props.value);
  const [saved, setSaved] = useState(false);
  return (
    <PreferencesForm
      {...props}
      value={value}
      status={saved ? "saved" : props.status}
      onChange={(next) => {
        setValue(next);
        setSaved(false);
      }}
      onSave={() => setSaved(true)}
      onReset={() => {
        setValue({});
        setSaved(false);
      }}
    />
  );
}

const meta = {
  title: "Features/Preferences/Style profile",
  component: PreferencesForm,
  parameters: { layout: "fullscreen" },
  args: {
    value: sample,
    skinSwatches: skinSwatchOptions,
    onChange: () => undefined,
    onSave: () => undefined,
    onReset: () => undefined,
  },
} satisfies Meta<typeof PreferencesForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedProfile: Story = {
  render: (args) => <ControlledPreferences {...args} />,
};
export const NoSelections: Story = {
  args: { value: {} },
  render: (args) => <ControlledPreferences {...args} />,
};
export const SaveFailed: Story = {
  args: {
    status: "error",
    statusMessage: "We could not save your choices. Try again.",
  },
  render: (args) => <PreferencesForm {...args} />,
};
