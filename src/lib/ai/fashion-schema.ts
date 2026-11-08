import { z } from "zod";

export const FASHION_SCHEMA_VERSION = "fashion-item.v1";
export const categorySchema = z.enum([
  "top",
  "bottom",
  "dress",
  "outerwear",
  "shoes",
  "accessory",
]);

const text = z.string().trim().min(1).max(120);
const scalarKeys = [
  "garmentForm",
  "functionalFamily",
  "constructionFamily",
  "primaryColor",
  "colorFamily",
  "colorTemperature",
  "colorValue",
  "colorChroma",
  "contrastLevel",
  "dominantHex",
  "pattern",
  "patternScale",
  "patternDensity",
  "patternDirection",
  "patternPlacement",
  "apparentMaterial",
  "texture",
  "fabricStructure",
  "surfaceFinish",
  "sheen",
  "opacity",
  "visualWeight",
  "drape",
  "visibleStretch",
  "silhouette",
  "fit",
  "volume",
  "structure",
  "length",
  "cut",
  "waistDefinition",
  "asymmetry",
  "closure",
  "closurePlacement",
  "pleats",
  "darts",
  "panels",
  "hemShape",
  "liningVisible",
  "hardwareColor",
  "hardwareFinish",
  "logoPresence",
  "graphicContent",
  "layeringRole",
  "layeringPosition",
  "overlapNotes",
  "formality",
  "occasion",
  "season",
  "coverage",
  "mobilityNotes",
  "careBurden",
  "wearabilityNotes",
  "neckline",
  "collar",
  "lapel",
  "sleeve",
  "sleeveShape",
  "cuff",
  "shoulderConstruction",
  "bodiceShape",
  "backDetail",
  "strapWidth",
  "rise",
  "waistband",
  "legShape",
  "inseamLengthClass",
  "skirtShape",
  "slitPlacement",
  "slitHeightClass",
  "frontConstruction",
  "crotchConstruction",
  "fasteningStyle",
  "insulationAppearance",
  "hood",
  "vent",
  "belted",
  "weatherFeatures",
  "shoeType",
  "toeShape",
  "heelType",
  "heelHeightClass",
  "soleType",
  "shaftHeight",
  "upperAppearance",
  "activitySpecialization",
  "bagType",
  "bagScale",
  "strapType",
  "handleType",
  "compartmentsVisible",
  "accessoryType",
  "metalAppearance",
  "stoneAppearance",
  "scale",
  "motif",
  "placement",
  "shape",
  "brim",
  "wrapStyle",
  "lengthClass",
  "edgeFinish",
  "widthClass",
  "buckleShape",
] as const;
const listKeys = [
  "colors",
  "secondaryColors",
  "accentHex",
  "patternColors",
  "seamDetails",
  "pockets",
  "trim",
  "embellishments",
  "styleTags",
  "suitableOccasions",
  "climateSuitability",
  "carryMode",
] as const;

const scalar = text.nullable().optional();
const list = z
  .array(z.string().trim().min(1).max(40))
  .max(8)
  .nullable()
  .optional();
type ScalarShape = { [K in (typeof scalarKeys)[number]]: typeof scalar };
type ListShape = { [K in (typeof listKeys)[number]]: typeof list };
const scalarShape = Object.fromEntries(
  scalarKeys.map((key) => [key, scalar]),
) as ScalarShape;
const listShape = Object.fromEntries(
  listKeys.map((key) => [key, list]),
) as ListShape;

export const attributesSchema = z
  .strictObject({ ...scalarShape, ...listShape })
  .superRefine((attributes, context) => {
    if (
      new TextEncoder().encode(JSON.stringify(attributes)).byteLength > 8192
    ) {
      context.addIssue({
        code: "custom",
        message: "Item attributes exceed 8 KiB.",
      });
    }
    for (const key of listKeys) {
      const values = attributes[key];
      if (values && new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: "Use distinct attribute values.",
        });
      }
    }
    if (attributes.colors && attributes.colors.length > 5) {
      context.addIssue({
        code: "custom",
        path: ["colors"],
        message: "Use at most five colors.",
      });
    }
    for (const value of [
      attributes.dominantHex,
      ...(attributes.accentHex ?? []),
    ]) {
      if (value && !/^#[0-9a-f]{6}$/i.test(value)) {
        context.addIssue({
          code: "custom",
          message: "Use a six-digit sRGB hex value.",
        });
      }
    }
  });

export const observationSchema = z.strictObject({
  path: z.string().min(1).max(160),
  source: z.enum(["user", "visual_inference", "catalog", "derived", "sample"]),
  state: z.enum([
    "observed",
    "reported",
    "inferred",
    "not_visible",
    "not_applicable",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string().max(400),
  uncertainty: z.string().max(400).nullable(),
});

const shoeKeys = [
  "shoeType",
  "toeShape",
  "heelType",
  "heelHeightClass",
  "soleType",
  "shaftHeight",
  "upperAppearance",
  "activitySpecialization",
] as const;
const lowerKeys = [
  "rise",
  "waistband",
  "legShape",
  "inseamLengthClass",
  "skirtShape",
  "slitPlacement",
  "slitHeightClass",
  "frontConstruction",
  "crotchConstruction",
] as const;
const upperKeys = [
  "neckline",
  "collar",
  "lapel",
  "sleeve",
  "sleeveShape",
  "cuff",
  "shoulderConstruction",
  "bodiceShape",
  "backDetail",
  "strapWidth",
] as const;
const accessoryKeys = [
  "bagType",
  "bagScale",
  "strapType",
  "handleType",
  "compartmentsVisible",
  "accessoryType",
  "metalAppearance",
  "stoneAppearance",
  "motif",
  "brim",
  "wrapStyle",
  "edgeFinish",
  "buckleShape",
] as const;

export const garmentSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(160),
    category: categorySchema,
    subcategory: text.nullable(),
    description: z.string().trim().min(1).max(600),
    attributes: attributesSchema,
    observations: z.array(observationSchema).max(160),
    confidence: z.number().min(0).max(1).nullable(),
    uncertainty: z.array(z.string().min(1).max(400)).max(12),
  })
  .superRefine((garment, context) => {
    const forbidden = [
      ...(garment.category === "shoes" ? [] : shoeKeys),
      ...(["bottom", "dress"].includes(garment.category) ? [] : lowerKeys),
      ...(["top", "dress", "outerwear"].includes(garment.category)
        ? []
        : upperKeys),
      ...(garment.category === "accessory" ? [] : accessoryKeys),
    ];
    for (const key of forbidden) {
      if (garment.attributes[key] != null) {
        context.addIssue({
          code: "custom",
          path: ["attributes", key],
          message: "This field does not apply to the garment category.",
        });
      }
    }
    const paths = garment.observations.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "Observation paths must be unique.",
      });
    }
    const allowedPaths = new Set([
      "name",
      "category",
      "subcategory",
      "description",
      ...scalarKeys.map((key) => `attributes.${key}`),
      ...listKeys.map((key) => `attributes.${key}`),
    ]);
    for (const entry of garment.observations) {
      if (!allowedPaths.has(entry.path)) {
        context.addIssue({
          code: "custom",
          path: ["observations"],
          message: "Observation path is not a canonical item field.",
        });
      }
    }
  });

export const evidenceReferenceSchema = z.strictObject({
  source: z.enum(["inspiration", "wardrobe", "preference", "context"]),
  id: z.uuid().nullable(),
  path: z.string().min(1).max(160),
});

export const explanationSchema = z.strictObject({
  summary: z.string().min(1).max(600),
  whyThis: z
    .array(
      z.strictObject({
        reason: z.string().min(1).max(400),
        evidence: z.array(evidenceReferenceSchema).min(1).max(8),
      }),
    )
    .min(2)
    .max(4),
  inputsUsed: z.array(z.string().min(1).max(160)).max(32),
  differences: z.array(z.string().min(1).max(400)).max(12),
  uncertainty: z.array(z.string().min(1).max(400)).max(12),
  sourceRevision: z.number().int().positive(),
});

export const canonicalDescriptionSchema = z
  .strictObject({
    pieces: z.array(garmentSchema).min(1).max(24),
  })
  .superRefine(({ pieces }, context) => {
    pieces.forEach((piece, index) => {
      const populated = [
        "name",
        "category",
        "description",
        ...(piece.subcategory ? ["subcategory"] : []),
        ...Object.entries(piece.attributes)
          .filter(
            ([, value]) =>
              value != null && (!Array.isArray(value) || value.length > 0),
          )
          .map(([key]) => `attributes.${key}`),
      ];
      const observed = new Set(
        piece.observations
          .filter((entry) => entry.evidence.length > 0)
          .map((entry) => entry.path),
      );
      for (const path of populated) {
        if (!observed.has(path)) {
          context.addIssue({
            code: "custom",
            path: ["pieces", index, "observations"],
            message: `Missing field evidence for ${path}.`,
          });
        }
      }
      if (
        piece.observations.some(
          (entry) => !["visual_inference", "derived"].includes(entry.source),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["pieces", index, "observations"],
          message: "Image reading cannot invent user or catalog facts.",
        });
      }
      if (piece.attributes.dominantHex || piece.attributes.accentHex?.length) {
        context.addIssue({
          code: "custom",
          path: ["pieces", index, "attributes"],
          message: "Image reading cannot invent measured color values.",
        });
      }
    });
  });

const physicalEvidenceSchema = z.strictObject({
  source: z.enum(["visual_inference", "derived"]),
  state: z.enum([
    "observed",
    "inferred",
    "not_visible",
    "not_applicable",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string().min(1).max(400),
  uncertainty: z.string().max(400).nullable(),
});
const descriptionScalarKeys = scalarKeys.filter((key) => key !== "dominantHex");
const descriptionListKeys = listKeys.filter(
  (key) => key !== "accentHex" && key !== "colors",
);
function descriptionAttributesFor(category: z.infer<typeof categorySchema>, proposed = false) {
  const evidence = proposed ? physicalEvidenceSchema.extend({ source: z.literal("derived") }) : physicalEvidenceSchema;
  const forbidden = new Set<string>([
    ...(category === "shoes" ? [] : shoeKeys),
    ...(["bottom", "dress"].includes(category) ? [] : lowerKeys),
    ...(["top", "dress", "outerwear"].includes(category) ? [] : upperKeys),
    ...(category === "accessory" ? [] : accessoryKeys),
  ]);
  return z.union([
  evidence.extend({
    key: z.enum(descriptionScalarKeys.filter((key) => !forbidden.has(key))),
    value: text.nullable(),
  }),
  evidence.extend({
    key: z.enum(descriptionListKeys),
    value: z.array(z.string().trim().min(1).max(40)).max(8),
  }),
  evidence.extend({
    key: z.literal("colors"),
    value: z.array(z.string().trim().min(1).max(40)).max(5),
  }),
  ]);
}

function descriptionProjectionFor<T extends z.infer<typeof categorySchema>>(category: T, proposed = false) {
  const evidence = proposed ? physicalEvidenceSchema.extend({ source: z.literal("derived") }) : physicalEvidenceSchema;
  return z.strictObject({
    name: z.string().trim().min(1).max(160),
    category: z.literal(category),
    subcategory: text.nullable(),
    description: z.string().trim().min(1).max(600),
    coreEvidence: z.strictObject({
      name: evidence,
      category: evidence,
      subcategory: evidence,
      description: evidence,
    }),
    attributes: z.array(descriptionAttributesFor(category, proposed)).max(120),
    confidence: z.number().min(0).max(1).nullable(),
    uncertainty: z.array(z.string().min(1).max(400)).max(12),
  });
}

export function compactGarmentOutputSchema(category: z.infer<typeof categorySchema>, proposed = false) {
  return descriptionProjectionFor(category, proposed)
  .superRefine((piece, context) => {
    const keys = piece.attributes.map((entry) => entry.key);
    if (new Set(keys).size !== keys.length)
      context.addIssue({
        code: "custom",
        path: ["attributes"],
        message: "Attribute keys must be unique.",
      });
  })
  .transform((piece): z.input<typeof garmentSchema> => ({
    name: piece.name,
    category: piece.category,
    subcategory: piece.subcategory,
    description: piece.description,
    attributes: Object.fromEntries(
      piece.attributes
        .filter(
          (entry) =>
            entry.value !== null &&
            (!Array.isArray(entry.value) || entry.value.length > 0),
        )
        .map(({ key, value }) => [key, value]),
    ),
    observations: [
      ...Object.entries(piece.coreEvidence).map(([path, evidence]) => ({
        path,
        ...evidence,
      })),
      ...piece.attributes.map((entry) => ({
        path: `attributes.${entry.key}`,
        source: entry.source,
        state: entry.state,
        confidence: entry.confidence,
        evidence: entry.evidence,
        uncertainty: entry.uncertainty,
      })),
    ],
    confidence: piece.confidence,
    uncertainty: piece.uncertainty,
  }))
  .pipe(garmentSchema);
}

export const descriptionPieceSchema = z.union(categorySchema.options.map((category) => compactGarmentOutputSchema(category)));

export const descriptionSchema = z
  .strictObject({
    pieces: z.array(descriptionPieceSchema).min(1).max(24),
  })
  .pipe(canonicalDescriptionSchema);

export const confidenceSchema = z.strictObject({
  explanation: explanationSchema,
  insights: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(120),
        description: z.string().min(1).max(600),
      }),
    )
    .min(1)
    .max(8),
  occasions: z.array(z.string().min(1).max(120)).max(8),
});

export function confidenceOutputSchema(context: {
  assetId: string;
  sourceRevision: number;
  preferenceKeys: string[];
  hasOccasion: boolean;
}) {
  const assetId = z.uuid().parse(context.assetId);
  const revision = z.number().int().positive().parse(context.sourceRevision);
  const preferenceKeys = [...new Set(context.preferenceKeys)];
  const references = [
    z.strictObject({
      source: z.literal("inspiration"),
      id: z.literal(assetId),
      path: z.literal("image"),
    }),
    ...(preferenceKeys.length
      ? [
          z.strictObject({
            source: z.literal("preference"),
            id: z.null(),
            path: z.enum(preferenceKeys),
          }),
        ]
      : []),
    ...(context.hasOccasion
      ? [
          z.strictObject({
            source: z.literal("context"),
            id: z.null(),
            path: z.literal("occasion"),
          }),
        ]
      : []),
  ];
  const evidence = z.union(references);
  const allowedInputs = [
    "inspiration",
    ...(context.hasOccasion ? ["occasion"] : []),
    ...preferenceKeys,
  ];
  return confidenceSchema.extend({
    explanation: explanationSchema.extend({
      whyThis: z
        .array(
          z.strictObject({
            reason: z.string().min(1).max(400),
            evidence: z.array(evidence).min(1).max(8),
          }),
        )
        .min(2)
        .max(4),
      inputsUsed: z.array(z.enum(allowedInputs)).max(32),
      sourceRevision: z.literal(revision),
    }),
  });
}

export type Category = z.infer<typeof categorySchema>;
export type Attributes = z.infer<typeof attributesSchema>;
export type Garment = z.infer<typeof garmentSchema>;
export type Explanation = z.infer<typeof explanationSchema>;

export function compactAttributes(attributes: Attributes): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(
      ([, value]) =>
        value != null && (!Array.isArray(value) || value.length > 0),
    ),
  );
}

export function garmentProvenance(
  garment: Garment,
  assetId: string | null,
  model: string,
) {
  return Object.fromEntries(
    garment.observations.map(({ path, ...observation }) => [
      path,
      { ...observation, assetId, provider: "openai", model },
    ]),
  );
}
