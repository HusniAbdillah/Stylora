export type CapsuleTemplateId =
  | "everyday-ease"
  | "modern-workweek"
  | "weekend-travel"
  | "warm-weather"
  | "evening";

export type CapsuleItem = {
  id: string;
  name: string;
  category: "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
  imageUrl?: string | null;
  inventoryStatus: "owned" | "saved_candidate";
};

export type CapsuleDraft = {
  templateId: CapsuleTemplateId | null;
  days: number;
  targetOutfits: number;
  activities: string[];
  weather: string | null;
  laundry: string | null;
  notes: string;
  palette: string | null;
  dressCode: string | null;
  luggage: string | null;
  footwear: string | null;
  coverage: string | null;
  care: string | null;
  includedItemIds: string[];
  requiredItemIds: string[];
  excludedItemIds: string[];
};

export type CapsuleOutfit = {
  id: string;
  title: string;
  occasion?: string;
  items: CapsuleItem[];
  reasons: string[];
  inputsUsed?: string[];
  uncertainty?: string[];
  requiresAddition?: boolean;
  differences?: string[];
  proposedItems?: {
    name: string;
    category: CapsuleItem["category"];
    description: string;
  }[];
  evidence?: { reason: string; evidenceItemIds: string[] }[];
};

export type CapsuleAddition = {
  id: string;
  name: string;
  imageUrl?: string | null;
  brief: string;
  unlockedOutfitIds: string[];
  supportingItemNames: string[];
};

export type CapsuleResult = {
  id: string;
  revision?: number;
  title: string;
  subtitle?: string;
  templateId?: CapsuleTemplateId | null;
  pieces: CapsuleItem[];
  outfits: CapsuleOutfit[];
  additions: CapsuleAddition[];
  isDraft?: boolean;
  pieceCount?: number;
  outfitCount?: number;
};

export type CapsuleTemplate = {
  id: CapsuleTemplateId;
  name: string;
  tagline: string;
  imageUrl: string;
  cues: string[];
  defaults: Partial<CapsuleDraft>;
};

export const CAPSULE_TEMPLATES: CapsuleTemplate[] = [
  {
    id: "everyday-ease",
    name: "Everyday ease",
    tagline: "Repeatable daily dressing",
    imageUrl: "/design/images/tpl-everyday-ease.webp",
    cues: ["Relaxed fit", "Soft neutrals", "Comfort shoes"],
    defaults: {
      days: 5,
      targetOutfits: 5,
      activities: ["City walks"],
      palette: "Soft color",
      dressCode: "Casual",
      footwear: "Walkable flats",
      care: "Easy care",
    },
  },
  {
    id: "modern-workweek",
    name: "Modern workweek",
    tagline: "Five work-ready days",
    imageUrl: "/design/images/tpl-modern-workweek.webp",
    cues: ["Smart casual", "Structured layers", "Low contrast"],
    defaults: {
      days: 5,
      targetOutfits: 5,
      activities: ["Meetings"],
      palette: "Cool classics",
      dressCode: "Smart casual",
      footwear: "Walkable flats",
    },
  },
  {
    id: "weekend-travel",
    name: "Weekend travel",
    tagline: "Pack light, repeat well",
    imageUrl: "/design/images/tpl-weekend-travel.webp",
    cues: ["Layering", "Versatile shoes", "Climate aware"],
    defaults: {
      days: 3,
      targetOutfits: 4,
      activities: ["City walks", "Dinner out", "Museums"],
      palette: "Warm neutrals",
      dressCode: "Smart casual",
      luggage: "Carry-on",
      footwear: "Walkable flats",
    },
  },
  {
    id: "warm-weather",
    name: "Warm-weather lightness",
    tagline: "Airy looks for hot days",
    imageUrl: "/design/images/tpl-warm-weather.webp",
    cues: ["Light visual weight", "Adaptable coverage", "Sandals"],
    defaults: {
      days: 5,
      targetOutfits: 5,
      activities: ["Beach", "City walks"],
      weather: "Hot and humid",
      palette: "Soft color",
      dressCode: "Casual",
    },
  },
  {
    id: "evening",
    name: "Evening versatility",
    tagline: "A few polished nights out",
    imageUrl: "/design/images/tpl-evening.webp",
    cues: ["Texture contrast", "Dark palette", "One accent"],
    defaults: {
      days: 3,
      targetOutfits: 3,
      activities: ["Dinner out"],
      palette: "Cool classics",
      dressCode: "Evening",
    },
  },
];

export const EMPTY_CAPSULE_DRAFT: CapsuleDraft = {
  templateId: null,
  days: 3,
  targetOutfits: 4,
  activities: [],
  weather: null,
  laundry: null,
  notes: "",
  palette: null,
  dressCode: null,
  luggage: null,
  footwear: null,
  coverage: null,
  care: null,
  includedItemIds: [],
  requiredItemIds: [],
  excludedItemIds: [],
};
