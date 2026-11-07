import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PieceEditor } from "./piece-editor";
import { ReviewPieces } from "./review-pieces";
import type { ConfidenceReview, DetectedPiece, PieceEditValues } from "./types";

const imageUrl = "/design/images/inspiration-sample.webp";
const samplePieces: DetectedPiece[] = [
  {
    id: "piece-coat",
    name: "Stone trench coat",
    category: "outerwear",
    subcategory: "trench coat",
    colors: [{ name: "Stone" }],
    attributes: [
      { label: "Fabric look", value: "Gabardine-like twill" },
      { label: "Fit", value: "Relaxed" },
      { label: "Length", value: "Below the knee" },
      { label: "Closure", value: "Double-breasted, belted" },
    ],
    evidence: "Notch lapels, storm flap and a tie belt are visible.",
    advice:
      "Warm stone sits close to your warm undertone. Wear it open to keep the vertical line.",
    editValues: {
      apparentMaterial: "Gabardine-like twill",
      fit: "Relaxed",
      length: "Below the knee",
      colors: "Stone",
    },
  },
  {
    id: "piece-shirt",
    name: "Ivory relaxed shirt",
    category: "top",
    subcategory: "button-front shirt",
    colors: [{ name: "Ivory" }],
    attributes: [
      { label: "Fabric look", value: "Linen-like, slub texture" },
      { label: "Fit", value: "Relaxed" },
      { label: "Collar", value: "Point collar" },
    ],
    evidence: "Fine slub texture is visible at the placket.",
    advice: "Ivory near the face reads softer than stark white.",
  },
  {
    id: "piece-trousers",
    name: "Charcoal wide-leg trousers",
    category: "bottom",
    subcategory: "tailored trousers",
    colors: [{ name: "Charcoal" }],
    attributes: [
      { label: "Fabric look", value: "Smooth wool-like" },
      { label: "Rise", value: "High" },
      { label: "Leg", value: "Wide, full length" },
    ],
    evidence: "Pressed crease and pleats are visible from the waistband.",
    advice:
      "The high rise and full length extend the leg line with your relaxed fit goal.",
  },
  {
    id: "piece-tote",
    name: "Brown leather tote",
    category: "accessory",
    subcategory: "shoulder tote",
    colors: [{ name: "Brown" }],
    attributes: [
      { label: "Surface", value: "Leather-like, smooth" },
      { label: "Structure", value: "Soft" },
      { label: "Carry", value: "Shoulder" },
    ],
    evidence: "Long straps and an open top are visible.",
    advice:
      "A deep brown or oxblood bag repeats the loafers and anchors the warm palette.",
  },
];

const readyConfidence: ConfidenceReview = {
  status: "ready",
  palette: [
    { name: "Stone" },
    { name: "Ivory" },
    { name: "Charcoal" },
    { name: "Oxblood" },
    { name: "Brown" },
  ],
  insights: [
    {
      title: "Warm undertone",
      description:
        "Ivory and oxblood near the face add warmth; the cool charcoal stays low.",
    },
    {
      title: "Skin depth 04",
      description:
        "Medium contrast between shirt and trousers keeps the look balanced.",
    },
    {
      title: "Rectangle, relaxed fit",
      description:
        "The open trench draws a long vertical line; a half tuck adds a waist point.",
    },
  ],
  occasions: ["Smart casual", "Office", "Weekend city"],
  uncertainty:
    "Trench length and shoe material are partly hidden in the photo.",
};

function InteractiveReview() {
  const [pieces, setPieces] = useState(samplePieces);
  const [editing, setEditing] = useState<DetectedPiece | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [matchStatus, setMatchStatus] = useState<"ready" | "running">("ready");
  const openEditor = (piece: DetectedPiece | null) => {
    setEditing(piece);
    setEditorOpen(true);
  };
  const save = (values: PieceEditValues) => {
    const attributes = [
      ["Fabric look", values.apparentMaterial],
      ["Pattern", values.pattern],
      ["Texture", values.texture],
      ["Fit", values.fit],
      ["Cut", values.cut],
      ["Length", values.length],
      ["Occasion", values.occasion],
      ["Styling", values.styleTags],
    ]
      .filter(([, value]) => value.trim())
      .map(([label, value]) => ({ label, value }));
    const next: DetectedPiece = {
      id: editing?.id ?? `manual-${pieces.length + 1}`,
      name: values.name,
      category: values.category,
      subcategory: editing?.subcategory,
      colors: values.colors
        .split(",")
        .map((name) => ({ name: name.trim() }))
        .filter((color) => color.name),
      attributes,
      evidence: editing?.evidence ?? "Added manually for this story.",
      advice: null,
      editValues: values,
    };
    setPieces((current) =>
      editing
        ? current.map((piece) => (piece.id === editing.id ? next : piece))
        : [...current, next],
    );
    setMatchStatus("running");
  };
  return (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <ReviewPieces
        imageUrl={imageUrl}
        pieces={pieces}
        expectedPieceCount={pieces.length + 1}
        descriptionStatus="running"
        confidence={readyConfidence}
        matchStatus={matchStatus}
        onMatch={() => setMatchStatus("ready")}
        onAddPiece={() => openEditor(null)}
        onEditPiece={openEditor}
        onRemovePiece={openEditor}
      />
      <PieceEditor
        open={editorOpen}
        piece={editing}
        pieceNumber={
          editing
            ? pieces.findIndex((piece) => piece.id === editing.id) + 1
            : undefined
        }
        onClose={() => setEditorOpen(false)}
        onSave={save}
        onRemove={(piece) => {
          setPieces((current) =>
            current.filter((entry) => entry.id !== piece.id),
          );
          setMatchStatus("running");
        }}
      />
    </div>
  );
}

const meta = {
  title: "Features/Create/Review pieces",
  component: ReviewPieces,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ReviewPieces>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditablePartialReview: Story = {
  args: { imageUrl, pieces: samplePieces, confidence: readyConfidence },
  render: () => <InteractiveReview />,
};
export const IndependentConfidenceFailure: Story = {
  args: {
    imageUrl,
    pieces: samplePieces.slice(0, 2),
    expectedPieceCount: 5,
    descriptionStatus: "running",
    confidence: {
      status: "failed",
      errorMessage:
        "The confidence review could not be completed. The described pieces remain available.",
    },
    onRetryConfidence: () => undefined,
  },
  render: (args) => (
    <div className="min-h-screen bg-porcelain px-4 py-8 sm:px-8">
      <ReviewPieces {...args} />
    </div>
  ),
};
