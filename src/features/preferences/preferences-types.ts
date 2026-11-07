export type BodyIllustrationGroup = "women" | "men";

export type SkinSwatchOption = {
  id: string;
  label: string;
  hex: string;
  imageSrc: string;
};

export type IllustrationOption = {
  id: string;
  label: string;
  description: string;
  imageSrc: string;
};

export type PreferencesDraft = {
  skinSwatchId?: string | null;
  skinSwatchHex?: string | null;
  undertone?: string | null;
  contrast?: string | null;
  bodyIllustrationGroup?: BodyIllustrationGroup | null;
  bodyIllustrationId?: string | null;
  fit?: string | null;
  proportions?: string[];
  styles?: string[];
  colorFamilies?: string[];
  occasions?: string[];
  climate?: string[];
  coverage?: string[];
  lengths?: string[];
  layering?: string[];
  fabricDislikes?: string[];
  footwearComfort?: string[];
  careTolerance?: string[];
};

export const skinSwatchOptions: SkinSwatchOption[] = [
  {
    id: "depth_01",
    label: "Depth 1",
    hex: "#F1D4C2",
    imageSrc: "/design/preferences/skin-depth-01.svg",
  },
  {
    id: "depth_02",
    label: "Depth 2",
    hex: "#E3BFA7",
    imageSrc: "/design/preferences/skin-depth-02.svg",
  },
  {
    id: "depth_03",
    label: "Depth 3",
    hex: "#CFA080",
    imageSrc: "/design/preferences/skin-depth-03.svg",
  },
  {
    id: "depth_04",
    label: "Depth 4",
    hex: "#B9805D",
    imageSrc: "/design/preferences/skin-depth-04.svg",
  },
  {
    id: "depth_05",
    label: "Depth 5",
    hex: "#8A573D",
    imageSrc: "/design/preferences/skin-depth-05.svg",
  },
  {
    id: "depth_06",
    label: "Depth 6",
    hex: "#543526",
    imageSrc: "/design/preferences/skin-depth-06.svg",
  },
];

export const womenBodyIllustrations: IllustrationOption[] = [
  {
    id: "hourglass",
    label: "Hourglass",
    description: "Shoulders and hips similar, defined waist",
    imageSrc: "/design/preferences/body-hourglass.svg",
  },
  {
    id: "pear",
    label: "Pear",
    description: "Hips wider than shoulders",
    imageSrc: "/design/preferences/body-pear.svg",
  },
  {
    id: "round",
    label: "Round",
    description: "Fuller through the middle",
    imageSrc: "/design/preferences/body-round.svg",
  },
  {
    id: "rectangle",
    label: "Rectangle",
    description: "Shoulders, waist and hips aligned",
    imageSrc: "/design/preferences/body-rectangle.svg",
  },
  {
    id: "inverted_triangle",
    label: "Inverted triangle",
    description: "Shoulders wider than hips",
    imageSrc: "/design/preferences/body-inverted-triangle.svg",
  },
];

export const menBodyIllustrations: IllustrationOption[] = [
  {
    id: "hourglass",
    label: "Hourglass",
    description: "Shoulders and hips similar, defined waist",
    imageSrc: "/design/preferences/body-men-hourglass.svg",
  },
  {
    id: "pear",
    label: "Pear",
    description: "Hips wider than shoulders",
    imageSrc: "/design/preferences/body-men-pear.svg",
  },
  {
    id: "round",
    label: "Round",
    description: "Fuller through the middle",
    imageSrc: "/design/preferences/body-men-round.svg",
  },
  {
    id: "rectangle",
    label: "Rectangle",
    description: "Shoulders, waist and hips aligned",
    imageSrc: "/design/preferences/body-men-rectangle.svg",
  },
  {
    id: "inverted_triangle",
    label: "Inverted triangle",
    description: "Shoulders wider than hips",
    imageSrc: "/design/preferences/body-men-inverted-triangle.svg",
  },
];

export const fitIllustrations: IllustrationOption[] = [
  {
    id: "fitted",
    label: "Fitted",
    description: "Close to the body",
    imageSrc: "/design/preferences/fit-fitted.svg",
  },
  {
    id: "regular",
    label: "Regular",
    description: "Room to move",
    imageSrc: "/design/preferences/fit-regular.svg",
  },
  {
    id: "relaxed",
    label: "Relaxed",
    description: "Easy and draped",
    imageSrc: "/design/preferences/fit-relaxed.svg",
  },
  {
    id: "oversized",
    label: "Oversized",
    description: "Deliberate volume",
    imageSrc: "/design/preferences/fit-oversized.svg",
  },
];

export const styleIllustrations: IllustrationOption[] = [
  {
    id: "relaxed_minimal",
    label: "Relaxed minimal",
    description: "Easy neutrals and simple lines",
    imageSrc: "/design/preferences/style-relaxed-minimal.webp",
  },
  {
    id: "smart_tailoring",
    label: "Smart tailoring",
    description: "Defined pieces and polished layers",
    imageSrc: "/design/preferences/style-smart-tailoring.webp",
  },
  {
    id: "utility_casual",
    label: "Utility casual",
    description: "Functional layers and relaxed texture",
    imageSrc: "/design/preferences/style-utility-casual.webp",
  },
  {
    id: "soft_resort",
    label: "Soft resort",
    description: "Lightweight relaxed dressing",
    imageSrc: "/design/preferences/style-soft-resort.webp",
  },
  {
    id: "evening_polish",
    label: "Evening polish",
    description: "Refined contrast and shine",
    imageSrc: "/design/preferences/style-evening-polish.webp",
  },
];
