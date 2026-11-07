import { useEffect, useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InspirationUpload } from "./inspiration-upload";
import type {
  UploadPreferenceSummary,
  UploadTaskStatus,
} from "./inspiration-upload";

const sampleImage = "/design/images/inspiration-sample.webp";
const selectedPreferences: UploadPreferenceSummary = {
  undertone: "Warm, try ivory, rust and olive",
  skinTone: "Depth 04, warm medium",
  bodyShape: "Rectangle",
  fitGoal: "relaxed fit goal",
};
const parallelTasks: UploadTaskStatus[] = [
  {
    label: "Describing pieces",
    detail: "2 of 5 ready",
    status: "running",
    progressFraction: 0.4,
  },
  {
    label: "Review with confidence",
    detail: "Running in parallel",
    status: "running",
  },
];

function InteractiveUpload({
  initialImage = true,
  initialFailure = false,
}: {
  initialImage?: boolean;
  initialFailure?: boolean;
}) {
  const [image, setImage] = useState<string | null>(
    initialImage ? sampleImage : null,
  );
  const [status, setStatus] = useState<"empty" | "verified" | "failed">(
    initialFailure ? "failed" : initialImage ? "verified" : "empty",
  );
  const [fileName, setFileName] = useState<string | null>(
    initialImage ? "sample-look.webp" : null,
  );
  const [fileSizeLabel, setFileSizeLabel] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<string | null>("Everyday");
  const [preferences, setPreferences] =
    useState<UploadPreferenceSummary | null>(
      initialImage ? selectedPreferences : null,
    );
  const [analyzed, setAnalyzed] = useState(false);
  const localUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    },
    [],
  );
  const choose = (file: File) => {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = URL.createObjectURL(file);
    setImage(localUrl.current);
    setFileName(file.name);
    setFileSizeLabel(`${Math.ceil(file.size / 1024)} KB`);
    setStatus("verified");
    setAnalyzed(false);
  };
  return (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <InspirationUpload
        imageUrl={image}
        fileName={fileName}
        fileSizeLabel={fileSizeLabel}
        status={status}
        errorMessage={
          initialFailure ? "The upload could not be verified." : undefined
        }
        occasion={occasion}
        onOccasionChange={setOccasion}
        preferences={preferences}
        onPreferences={() =>
          setPreferences(preferences ? null : selectedPreferences)
        }
        tasks={status === "verified" ? parallelTasks : []}
        onChooseFile={choose}
        onRemove={() => {
          setImage(null);
          setFileName(null);
          setFileSizeLabel(null);
          setStatus("empty");
          setAnalyzed(false);
        }}
        onRetry={() => setStatus("verified")}
        onAnalyze={() => setAnalyzed(true)}
      />
      {analyzed && (
        <p
          role="status"
          className="mx-auto max-w-[1150px] rounded-xl bg-blush p-4 text-sm text-crimson"
        >
          Review would open immediately while description and confidence
          continue independently.
        </p>
      )}
    </div>
  );
}

const meta = {
  title: "Features/Create/Upload inspiration",
  component: InspirationUpload,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof InspirationUpload>;
export default meta;
type Story = StoryObj<typeof meta>;

export const VerifiedWithParallelTasks: Story = {
  args: { onChooseFile: () => undefined },
  render: () => <InteractiveUpload />,
};
export const EmptyAndOptionalPreferences: Story = {
  args: { onChooseFile: () => undefined },
  render: () => <InteractiveUpload initialImage={false} />,
};
export const FailedUpload: Story = {
  args: { onChooseFile: () => undefined },
  render: () => <InteractiveUpload initialFailure />,
};
