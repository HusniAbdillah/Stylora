import type {
  DetectedPiece,
  ConfidenceReview,
  UploadPreferenceSummary,
} from "./components";
import type { CreateLook, CreateOperation } from "./client-contract";
import type { WardrobeMatch } from "@/features/matching/components";
import type { OutfitIdea } from "@/features/outfits/components/outfit-ideas";
import type { PreferencesDraft } from "@/features/preferences/preferences-types";
import {
  skinSwatchOptions,
  womenBodyIllustrations,
  menBodyIllustrations,
} from "@/features/preferences/preferences-types";

export const label = (value: string) =>
  value
    .replace(/^attributes\./, "")
    .replaceAll(".", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ");
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : value && typeof value === "object"
      ? Object.values(value).flatMap((entry) =>
          typeof entry === "string"
            ? [entry]
            : Array.isArray(entry)
              ? entry.filter((text): text is string => typeof text === "string")
              : [],
        )
      : [];

export function presentPiece(piece: {
  id: string;
  name: string;
  category: DetectedPiece["category"];
  subcategory: string | null;
  attributes: Record<string, unknown>;
  observations: { evidence: string }[];
  uncertainty: string[];
}): DetectedPiece {
  const attributes = piece.attributes;
  const colors = Array.isArray(attributes.colors)
    ? attributes.colors.filter(
        (entry): entry is string => typeof entry === "string",
      )
    : typeof attributes.primaryColor === "string"
      ? [attributes.primaryColor]
      : [];
  const value = (key: string) =>
    typeof attributes[key] === "string" ? (attributes[key] as string) : "";
  return {
    id: piece.id,
    name: piece.name,
    category: piece.category,
    subcategory: piece.subcategory,
    colors: colors.map((name, index) => ({
      name,
      hex:
        index === 0 && typeof attributes.dominantHex === "string"
          ? attributes.dominantHex
          : null,
    })),
    attributes: [
      "apparentMaterial",
      "texture",
      "fit",
      "length",
      "collar",
      "rise",
      "legShape",
      "closure",
      "shoeType",
      "bagType",
    ]
      .filter((key) => value(key))
      .map((key) => ({
        label: key === "apparentMaterial" ? "Fabric look" : label(key),
        value: value(key),
      })),
    evidence: [
      ...new Set(
        piece.observations
          .map((observation) => observation.evidence)
          .filter(Boolean),
      ),
    ]
      .slice(0, 2)
      .join(" "),
    uncertainty: piece.uncertainty.join(" ") || null,
    editValues: {
      name: piece.name,
      category: piece.category,
      colors: colors.join(", "),
      apparentMaterial: value("apparentMaterial"),
      texture: value("texture"),
      pattern: value("pattern"),
      fit: value("fit"),
      cut: value("cut"),
      length: value("length"),
      occasion: value("occasion"),
      styleTags: strings(attributes.styleTags).join(", "),
    },
  };
}

export function presentConfidence(
  look: CreateLook | null,
  operation: CreateOperation | undefined,
): ConfidenceReview {
  const review = look?.confidenceReview;
  if (review && !review.stale)
    return {
      status: "ready",
      insights: review.insights,
      occasions: review.occasions,
      reasons: review.explanation.whyThis.map((why) => why.reason),
      evidence: [
        ...new Set(
          review.explanation.whyThis.flatMap((why) =>
            why.evidence.map(
              (evidence) =>
                `${label(evidence.source)}: ${label(evidence.path)}`,
            ),
          ),
        ),
      ],
      inputsUsed: review.explanation.inputsUsed.map(label),
      uncertainty: review.explanation.uncertainty.join(" "),
    };
  return {
    status:
      operation?.status === "failed"
        ? "failed"
        : operation?.status === "running" || operation?.status === "partial"
          ? "running"
          : operation?.status === "queued"
            ? "queued"
            : "unavailable",
    errorMessage: review?.stale
      ? "Your inputs changed. Refresh this analysis for the current version."
      : "Confidence review is not available for this version yet.",
  };
}

export function presentPreferences(
  preferences: PreferencesDraft,
): UploadPreferenceSummary {
  const skin = skinSwatchOptions.find(
    (option) =>
      option.id === preferences.skinSwatchId &&
      option.hex === preferences.skinSwatchHex,
  );
  const bodies =
    preferences.bodyIllustrationGroup === "men"
      ? menBodyIllustrations
      : womenBodyIllustrations;
  const body = bodies.find(
    (option) => option.id === preferences.bodyIllustrationId,
  );
  return {
    undertone: preferences.undertone ? label(preferences.undertone) : null,
    skinTone: skin?.label ?? null,
    skinToneHex: skin?.hex ?? null,
    bodyShape: body?.label ?? null,
    bodyImageUrl: body?.imageSrc ?? null,
    fitGoal: preferences.fit ? label(preferences.fit) : null,
  };
}

export function presentMatches(
  look: CreateLook,
  mode?: "live" | "sample" | "combined",
): WardrobeMatch[] {
  return look.matches
    .filter((match) => !match.stale && (!mode || match.inventoryMode === mode))
    .map((match) => ({
      id: match.id,
      outcome: match.outcome,
      inspiration: {
        name:
          look.pieces.find((piece) => piece.id === match.pieceId)?.name ??
          "Reviewed piece",
      },
      wardrobeItem: match.wardrobeItem
        ? {
            id: match.wardrobeItem.id,
            name: match.wardrobeItem.name,
            sourceType: match.wardrobeItem.sourceType,
            inventoryStatus: match.wardrobeItem.inventoryStatus,
            archivedAt: match.wardrobeItem.archivedAt,
            imageUrl: match.wardrobeItem.image?.url ?? null,
          }
        : null,
      sharedAttributes: strings(match.sharedAttributes),
      differences: strings(match.differences),
      explanation: match.explanation.summary,
      reasons: match.explanation.whyThis.map((why) => why.reason),
      evidence: [
        ...new Set(
          match.explanation.whyThis.flatMap((why) =>
            why.evidence.map(
              (evidence) =>
                `${evidence.source === "wardrobe" ? (match.wardrobeItem?.name ?? "Wardrobe item") : evidence.source === "inspiration" ? (look.pieces.find((piece) => piece.id === evidence.id)?.name ?? "Inspiration image") : label(evidence.source)}: ${label(evidence.path)}`,
            ),
          ),
        ),
      ],
      inputsUsed: match.explanation.inputsUsed.map(label),
      uncertainty: match.explanation.uncertainty,
      missingBrief:
        match.outcome === "missing" ? match.explanation.summary : null,
      rejectedCandidates: Array.isArray(match.rejectedCandidates)
        ? match.rejectedCandidates.flatMap((candidate) => {
            if (
              !candidate ||
              typeof candidate !== "object" ||
              Array.isArray(candidate) ||
              typeof candidate.reason !== "string"
            )
              return [];
            const item =
              candidate.wardrobeItem &&
              typeof candidate.wardrobeItem === "object" &&
              !Array.isArray(candidate.wardrobeItem)
                ? candidate.wardrobeItem
                : null;
            const image =
              item?.image &&
              typeof item.image === "object" &&
              !Array.isArray(item.image)
                ? item.image
                : null;
            return [
              {
                name: typeof item?.name === "string" ? item.name : undefined,
                reason: label(candidate.reason),
                imageUrl: typeof image?.url === "string" ? image.url : null,
              },
            ];
          })
        : [],
    }));
}

export function presentIdeas(
  look: CreateLook,
  operations: CreateOperation[],
  mode?: "live" | "sample" | "combined",
): OutfitIdea[] {
  return look.outfitOptions
    .filter(
      (option) => !option.stale && (!mode || option.inventoryMode === mode),
    )
    .map((option) => {
      const regeneration = operations.find(
        (operation) =>
          operation.kind === "option_regeneration" &&
          operation.subjectId === option.id &&
          operation.optionType === option.optionType,
      );
      return {
        id: option.id,
        direction: option.optionType,
        status:
          regeneration &&
          ["queued", "running", "partial"].includes(regeneration.status)
            ? "regenerating"
            : regeneration?.status === "failed"
              ? "failed"
              : option.status,
        errorMessage:
          regeneration?.status === "failed"
            ? "Another idea could not be prepared. Your previous idea is still available."
            : regeneration?.status === "cancelled"
              ? "Regeneration cancelled. Your previous idea is still available."
              : undefined,
        title: option.title,
        concept: option.concept,
        reasons: option.explanation.whyThis.map((reason) => reason.reason),
        inputsUsed: option.explanation.inputsUsed.map(label),
        differences: option.explanation.differences,
        uncertainty: option.explanation.uncertainty,
        pieces: option.items.map((item) => ({
          id: item.id,
          name:
            item.wardrobeItem?.name ??
            (item.missingBrief &&
            typeof item.missingBrief === "object" &&
            !Array.isArray(item.missingBrief) &&
            typeof item.missingBrief.name === "string"
              ? item.missingBrief.name
              : label(item.category)),
          status: item.itemKind === "owned" ? "owned" : "missing",
          imageUrl: item.wardrobeItem?.image?.url ?? null,
        })),
      };
    });
}
