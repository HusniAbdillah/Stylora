export type InventoryMode = "live" | "sample" | "combined";

export type MatchItem = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  attributes: Record<string, unknown>;
  sourceType: "live" | "manual" | "sample";
  revision: number;
  description?: string;
  provenance?: Record<string, unknown>;
  uncertainty?: string[];
  confidence?: number | null;
  assetId?: string | null;
  inventoryStatus?: string;
  archivedAt?: string | null;
};

export function isOwnedInventoryItem(
  item: MatchItem,
  mode: InventoryMode = "live",
) {
  return (
    item.inventoryStatus === "owned" &&
    (mode === "combined" || !item.archivedAt)
  );
}

export function classifyInventoryMatch(
  candidate: MatchItem,
  comparison: { score: number; evidenceCoverage: number },
) {
  return candidate.inventoryStatus === "owned" &&
    comparison.score >= 0.8 &&
    comparison.evidenceCoverage >= 0.25
    ? ("owned_match" as const)
    : ("wardrobe_alternative" as const);
}

const unknownValues = new Set([
  "unknown",
  "not_visible",
  "not_applicable",
  "unsure",
  "",
]);
const normalized = (value: unknown) =>
  typeof value === "string" && !unknownValues.has(value.toLowerCase().trim())
    ? value.toLowerCase().trim().replace(/[-_]+/g, " ")
    : null;
const sport =
  /sports uniform|sports jersey|football|soccer|cleats|cycling|protective|swimwear|sleepwear/;
const performance =
  /activewear|performance|athletic|sports|cleats|jersey|rain shell/;
const formal = /business formal|evening formal|black tie|formal dinner/;

function family(item: MatchItem) {
  return (
    normalized(item.attributes.functionalFamily) ?? normalized(item.subcategory)
  );
}

export function evaluateCandidate(
  reference: MatchItem,
  candidate: MatchItem,
  occasion: string | null = null,
  preferences: Record<string, string | string[]> = {},
  mode: InventoryMode = "live",
) {
  const reject = (reason: string) => ({
    eligible: false as const,
    reason,
    score: 0,
    evidenceCoverage: 0,
    sharedAttributes: [] as string[],
    differences: [] as string[],
  });
  if (
    mode === "combined"
      ? !["owned", "saved_candidate"].includes(candidate.inventoryStatus ?? "")
      : !isOwnedInventoryItem(candidate, mode)
  )
    return reject("not_active_owned_inventory");
  if (reference.category !== candidate.category)
    return reject("incompatible_category_role");
  const practicalConflict = itemConstraintConflict(
    candidate,
    preferences,
    occasion,
  );
  if (practicalConflict) return reject(practicalConflict);
  const referenceFamily = family(reference);
  const candidateFamily = family(candidate);
  const candidateRole =
    `${candidateFamily ?? ""} ${candidate.subcategory ?? ""}`.toLowerCase();
  const referenceRole =
    `${referenceFamily ?? ""} ${reference.subcategory ?? ""}`.toLowerCase();
  const tailoredRole =
    /tailoring|eveningwear|blazer|suit jacket|dinner jacket|tuxedo/;
  const specializedRole =
    /activewear|sports uniform|outdoor|protective|sleepwear|swimwear|rain shell/;
  if (
    (tailoredRole.test(referenceRole) && specializedRole.test(candidateRole)) ||
    (specializedRole.test(referenceRole) && tailoredRole.test(candidateRole))
  )
    return reject("incompatible_functional_family");
  if (sport.test(candidateRole) && !sport.test(referenceRole))
    return reject("incompatible_functional_family");
  if (
    candidateFamily &&
    sport.test(candidateFamily) &&
    candidateFamily !== referenceFamily
  )
    return reject("incompatible_functional_family");
  if (
    referenceFamily &&
    sport.test(referenceFamily) &&
    candidateFamily !== referenceFamily
  )
    return reject("incompatible_functional_family");
  const requiredFormality = [
    occasion,
    normalized(reference.attributes.formality),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const candidateConstruction =
    `${candidateFamily ?? ""} ${normalized(candidate.attributes.constructionFamily) ?? ""} ${candidate.subcategory ?? ""}`.toLowerCase();
  if (formal.test(requiredFormality) && performance.test(candidateConstruction))
    return reject("occasion_contradiction");
  if (
    reference.category === "accessory" &&
    reference.subcategory &&
    candidate.subcategory &&
    normalized(reference.subcategory) !== normalized(candidate.subcategory)
  )
    return reject("incompatible_accessory_role");
  const referenceCoverage = normalized(reference.attributes.coverage);
  const candidateCoverage = normalized(candidate.attributes.coverage);
  if (
    referenceCoverage &&
    candidateCoverage &&
    /covered|full|modest/.test(referenceCoverage) &&
    /revealing|sleeveless|strapless|minimal/.test(candidateCoverage)
  )
    return reject("coverage_contradiction");
  const referenceConstruction = normalized(
    reference.attributes.constructionFamily,
  );
  const candidateConstructionFamily = normalized(
    candidate.attributes.constructionFamily,
  );
  if (
    referenceConstruction &&
    candidateConstructionFamily &&
    /tailor|structured/.test(referenceConstruction) &&
    /performance|athletic|sports/.test(candidateConstructionFamily)
  )
    return reject("construction_contradiction");
  const keys = [
    "subcategory",
    "functionalFamily",
    "constructionFamily",
    "garmentForm",
    "silhouette",
    "fit",
    "length",
    "primaryColor",
    "pattern",
    "texture",
    "formality",
    "coverage",
  ];
  const sharedAttributes: string[] = [];
  const differences: string[] = [];
  let comparable = 0;
  for (const key of keys) {
    const referenceValue = normalized(
      key === "subcategory" ? reference.subcategory : reference.attributes[key],
    );
    const candidateValue = normalized(
      key === "subcategory" ? candidate.subcategory : candidate.attributes[key],
    );
    if (referenceValue === null || candidateValue === null) continue;
    comparable += 1;
    if (referenceValue === candidateValue)
      sharedAttributes.push(`${key}: ${referenceValue}`);
    else
      differences.push(
        `${key}: reference ${referenceValue}; wardrobe ${candidateValue}`,
      );
  }
  if (
    comparable < 2 ||
    sharedAttributes.length < 2 ||
    !sharedAttributes.some((entry) => !entry.startsWith("primaryColor:"))
  )
    return reject("insufficient_matching_evidence");
  return {
    eligible: true as const,
    reason: null,
    score: sharedAttributes.length / comparable,
    evidenceCoverage: comparable / keys.length,
    sharedAttributes,
    differences,
  };
}

export function itemConstraintConflict(
  item: MatchItem,
  preferences: Record<string, string | string[]>,
  occasion: string | null,
) {
  const footwear = preferences.footwearComfort;
  const heel = normalized(item.attributes.heelHeightClass);
  if (
    item.category === "shoes" &&
    Array.isArray(footwear) &&
    footwear.some((choice) => /flats only/i.test(choice)) &&
    heel &&
    !/^(flat|none|zero|0)$/.test(heel)
  )
    return "footwear_comfort_contradiction";
  const coverage = preferences.coverage;
  const coverageRequired =
    Array.isArray(coverage) &&
    coverage.some((choice) =>
      /shoulders covered|modest full coverage/i.test(choice),
    );
  if (
    coverageRequired &&
    /sleeveless|strapless|bare shoulder|revealing/.test(
      [
        item.attributes.coverage,
        item.attributes.sleeve,
        item.attributes.neckline,
      ]
        .map(normalized)
        .filter(Boolean)
        .join(" "),
    )
  )
    return "coverage_contradiction";
  if (
    occasion &&
    formal.test(occasion.toLowerCase()) &&
    /activity specific|sports uniform|activewear/.test(
      [item.attributes.formality, item.attributes.functionalFamily]
        .map(normalized)
        .filter(Boolean)
        .join(" "),
    )
  )
    return "occasion_contradiction";
  return null;
}

export function resolveEffectiveAttributes(input: {
  attributes: Record<string, unknown>;
  inferredAttributes?: Record<string, unknown>;
  corrections?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}) {
  const effective = { ...input.inferredAttributes, ...input.attributes };
  for (const [path, correction] of Object.entries(input.corrections ?? {})) {
    const key = path.startsWith("attributes.") ? path.slice(11) : path;
    if (["name", "category", "subcategory", "description"].includes(key))
      continue;
    if (
      correction &&
      typeof correction === "object" &&
      !Array.isArray(correction)
    ) {
      const record = correction as Record<string, unknown>;
      if ("correctedValue" in record) effective[key] = record.correctedValue;
      else if ("corrected_value" in record)
        effective[key] = record.corrected_value;
      else if ("value" in record) effective[key] = record.value;
    } else if (
      typeof correction === "string" ||
      Array.isArray(correction) ||
      correction === null
    )
      effective[key] = correction;
  }
  return effective;
}
