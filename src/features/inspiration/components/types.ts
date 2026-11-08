export type ColorSwatch = {
  name: string;
  hex?: string | null;
};

export type DetectedPiece = {
  id: string;
  name: string;
  category: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
  subcategory?: string | null;
  colors?: ColorSwatch[];
  attributes?: { label: string; value: string }[];
  evidence?: string | null;
  advice?: string | null;
  uncertainty?: string | null;
  editValues?: Partial<PieceEditValues>;
};

export type ConfidenceReview = {
  status: "queued" | "running" | "ready" | "failed" | "unavailable";
  stale?: boolean;
  palette?: ColorSwatch[];
  insights?: { title: string; description: string }[];
  occasions?: string[];
  uncertainty?: string | null;
  errorMessage?: string;
  reasons?: string[];
  evidence?: string[];
  inputsUsed?: string[];
};

export type PieceEditValues = {
  name: string;
  category: DetectedPiece["category"];
  colors: string;
  apparentMaterial: string;
  pattern: string;
  texture: string;
  fit: string;
  cut: string;
  length: string;
  occasion: string;
  styleTags: string;
};
