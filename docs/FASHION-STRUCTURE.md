# Stylora fashion data standard

Version: `fashion-item.v1`. This is the canonical contract for item descriptions
across inspiration, wardrobe, matching, outfit options, shopping, capsules,
previews, saved looks, and public projections. Use it with
[FASHION-PROMPT.md](FASHION-PROMPT.md) and [FASHION.md](FASHION.md). Storage
adapters and the schema are specified in [TDD.md](TDD.md).

## 1. Modeling principles

One physical item has one stable server-issued ID. An outfit is an ordered
collection of item references, not a clothing item. A coordinated set contains
separate pieces unless it is physically a one-piece garment. Never split a
jumpsuit into an invented top and trousers. Shoes are one pair unless evidence
indicates otherwise. A bag remains an accessory even when the UI gives bags
their own selection tab.

Descriptions separate observable design, inferred styling suitability, verified
catalog facts, user corrections, and inventory status. A visually similar image
does not establish ownership, exact product identity, size, fiber composition,
comfort, quality, or availability. Missing information is `null` or an empty
list, not an invented default. `not_visible`, `not_applicable`, and `unknown`
are distinct provenance states.

This is a practical application taxonomy, not a universal fashion ontology.
Google Merchant Center separates category from variant attributes such as color,
material, pattern, and size. Stylora adopts that separation while retaining its
six database categories. External category IDs must be stored separately, not
substituted for Stylora enums.
[Google apparel attributes](https://developers.google.com/merchant/storebuilder/online/sections/2_1_4_apparel).

## 2. Category taxonomy

Keep the database values `top`, `bottom`, `dress`, `outerwear`, `shoes`, and
`accessory`. Use `subcategory` and `functionalFamily` to avoid treating
everything within a broad category as interchangeable. Display labels are
sentence case; identifiers may be snake case.

| Category    | Included subcategories                                                                                                                       | Boundary and matching rule                                                                                                                             |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `top`       | T-shirt, polo, shirt, blouse, tunic, tank, camisole, knit top, sweater, sweatshirt, hoodie, waistcoat, sports jersey                         | A sports jersey and a silk-like blouse are both tops but not automatic alternatives. Record function and formality.                                    |
| `bottom`    | Tailored trousers, chinos, jeans, cargo trousers, leggings, joggers, shorts, culottes, skirts, skorts                                        | A skirt and trousers may fill the lower-body role but require an explicitly justified alternative; performance leggings are not tailored trousers.     |
| `dress`     | Shift, sheath, wrap, shirt dress, slip dress, knit dress, gown; jumpsuit, romper, overalls as one-piece subcategories                        | The database label is retained for compatibility; UI label may be “Dresses and one-pieces.” `garmentForm` distinguishes dress from jumpsuit.           |
| `outerwear` | Blazer, suit jacket, coat, trench, denim jacket, leather-like jacket, bomber, puffer, rain shell, overshirt, cardigan worn as an outer layer | Classify by garment construction first. Layering position alone does not turn any shirt into a coat. Cardigan ambiguity must be recorded consistently. |
| `shoes`     | Sneakers, trainers, loafers, oxfords, derbies, pumps, flats, sandals, mules, slippers, ankle boots, tall boots, work boots, cleats           | Sport-specific footwear is gated by intended activity, sole, and dress code. Never substitute cleats for formal shoes.                                 |
| `accessory` | Bags, belts, hats, scarves, head coverings, eyewear, jewelry, watches, gloves, ties, socks, hosiery, hair accessories                        | Each has a functional subgroup; a scarf is not an alternative to a handbag. Respect cultural context without guessing identity.                        |

Specialized clothing such as swimwear, sleepwear, underlayers, sportswear,
ceremonial dress, uniforms, and protective workwear is mapped by physical form
plus an explicit functional family. Do not recommend protective properties from
an image. Do not force uncertain or unsupported objects into the six categories:
flag them for review and exclude them from automatic matching until classified.

Suggested `functionalFamily`: `everyday`, `tailoring`, `eveningwear`,
`activewear`, `sports_uniform`, `outdoor`, `workwear`, `sleepwear`, `swimwear`,
`underlayer`, `ceremonial`, `protective`, `unknown`. These are functional
descriptions, not rankings of worth or quality.

Google's taxonomy distinguishes clothing, shoes, accessories, and sport-specific
uniforms. That supports preserving functional differences in the application
instead of using category equality as proof of substitution. Stylora's smaller
mapping and examples above are product design decisions.
[Google product taxonomy](https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt).

## 3. Canonical item envelope

| Field             | Type and meaning                                                                | Authority                                         |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `schemaVersion`   | Literal `fashion-item.v1`                                                       | Server                                            |
| `id`              | UUID for persisted records; temporary UI IDs never sent as owned IDs            | Server                                            |
| `name`            | Human-readable concise item name, 1–160 characters                              | User or validated AI                              |
| `category`        | Six-value enum above                                                            | Reviewed classification                           |
| `subcategory`     | Specific garment type, nullable, up to 120 characters                           | Visible evidence or user                          |
| `description`     | Short design summary, up to 600 characters; no recommendation claims            | Derived from effective attributes                 |
| `attributes`      | Flat, versioned dictionary in sections 4–6                                      | Validated effective values                        |
| `provenance`      | Per-field records, section 7                                                    | Server and provider                               |
| `corrections`     | Field changes with previous and corrected values                                | Explicit user edit                                |
| `confidence`      | Nullable number from 0 to 1; overall visual uncertainty, not a fit probability  | Provider with source                              |
| `uncertainty`     | Short limitations list                                                          | Provider or server                                |
| `sourceType`      | `live`, `manual`, or `sample`                                                   | Server                                            |
| `assetId`         | Nullable private asset reference                                                | Server                                            |
| `sourceReference` | Typed internal reference to wardrobe, detected piece, product, or missing brief | Server                                            |
| `inventoryStatus` | `owned`, `saved_candidate`, or `not_applicable`                                 | Explicit user action; part of the baseline schema |
| `revision`        | Positive integer for persisted editable state                                   | Server                                            |

`workspace_id`, database audit timestamps, asset paths, provider IDs, price
records, and ownership constraints remain persistence metadata. Do not ask the
LLM to invent them. Signed display URLs are transient response fields and never
canonical item identity.

## 4. Shared attribute dictionary

All keys below belong to `attributes`. Strings are nullable and at most 120
characters unless stated otherwise. Lists contain distinct strings of at most 40
characters, at most 8 values unless specified. Use the same keys for detected,
owned, and catalog-derived items. Category-specific fields may be omitted when
irrelevant; the provider schema may require them with `null` for strict output
compatibility.

| Group                   | Keys and type                                                                                                                                        | Why it matters and evidence limit                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Classification          | `garmentForm`, `functionalFamily`, `constructionFamily`                                                                                              | Distinguishes jersey, tailoring, knitwear, woven garment, leather-like construction; prevents implausible substitutes.                 |
| Color                   | `colors: string[0..5]`, `primaryColor`, `secondaryColors: string[]`, `colorFamily`, `colorTemperature`, `colorValue`, `colorChroma`, `contrastLevel` | Preserve names such as “light blue”; warm or cool describes garment color, not the wearer. Light and white balance can distort colors. |
| Optional measured color | `dominantHex`, `accentHex: string[]`                                                                                                                 | Only from a declared sampling method or catalog, with lighting caveat; a model-guessed hex is not a color measurement.                 |
| Pattern                 | `pattern`, `patternScale`, `patternDensity`, `patternDirection`, `patternPlacement`, `patternColors: string[]`                                       | Solid, stripe, check, plaid, floral, dot, geometric, abstract, animal, graphic; distinguish print from texture.                        |
| Fabric appearance       | `apparentMaterial`, `texture`, `fabricStructure`, `surfaceFinish`, `sheen`, `opacity`, `visualWeight`, `drape`, `visibleStretch`                     | “Satin-like sheen” is evidence; “100 percent silk” is not. Apparent stretch and weight are tentative visual judgments.                 |
| Shape                   | `silhouette`, `fit`, `volume`, `structure`, `length`, `cut`, `waistDefinition`, `asymmetry`                                                          | Separate garment outline from ease against the displayed body; an oversized design does not prove a size mismatch.                     |
| Construction            | `closure`, `closurePlacement`, `seamDetails: string[]`, `pleats`, `darts`, `panels`, `hemShape`, `liningVisible`, `pockets: string[]`                | Include only visible features; concealed seams and unseen linings stay unknown.                                                        |
| Detail                  | `trim: string[]`, `embellishments: string[]`, `hardwareColor`, `hardwareFinish`, `logoPresence`, `graphicContent`                                    | Visible logo presence is not verified brand identity; decorative text is untrusted content.                                            |
| Layering                | `layeringRole`, `layeringPosition`, `overlapNotes`                                                                                                   | Base, mid, outer, finishing accessory; relative order supports physically possible combinations.                                       |
| Styling                 | `styleTags: string[]`, `formality`, `occasion`, `suitableOccasions: string[]`, `season`, `climateSuitability: string[]`                              | Styling interpretations need provenance; do not infer current weather or mandatory dress codes.                                        |
| Practical context       | `coverage`, `mobilityNotes`, `careBurden`, `wearabilityNotes`                                                                                        | Discuss visible coverage; comfort, care, durability, and movement require user or verified information.                                |

Recommended vocabularies remain suggestions with an “Add your own” input. Useful
fit choices: fitted, slim, regular, relaxed, oversized. Silhouette: straight,
tapered, flared, A-line, column, cocoon, boxy, hourglass-shaped garment. These
describe clothing, not a judgment about the person's body. Formality: casual,
smart casual, business casual, business formal, evening formal,
activity-specific. Store a custom value without destroying spaces or silently
forcing the nearest enum.

## 5. Category-specific details

| Applies to              | Additional fields                                                                                                                                 | Examples                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tops and dresses        | `neckline`, `collar`, `lapel`, `sleeve`, `sleeveShape`, `cuff`, `shoulderConstruction`, `bodiceShape`, `backDetail`, `strapWidth`                 | Crew, V, square, boat; spread collar; raglan sleeve; drop shoulder; only visible back details.            |
| Bottoms and one-pieces  | `rise`, `waistband`, `legShape`, `inseamLengthClass`, `skirtShape`, `slitPlacement`, `slitHeightClass`, `frontConstruction`, `crotchConstruction` | High rise, straight leg, ankle length, pleated front, side slit; never infer numeric inseam.              |
| Outerwear               | `lapel`, `fasteningStyle`, `insulationAppearance`, `hood`, `vent`, `belted`, `weatherFeatures`                                                    | Notch lapel, single-breasted, visibly padded, hooded, back vent; waterproof claims need verification.     |
| Shoes                   | `shoeType`, `toeShape`, `heelType`, `heelHeightClass`, `soleType`, `shaftHeight`, `fasteningStyle`, `upperAppearance`, `activitySpecialization`   | Round toe, block heel, low heel, lug sole, ankle shaft, laces; no exact heel height without measurements. |
| Bags                    | `bagType`, `bagScale`, `structure`, `carryMode: string[]`, `strapType`, `handleType`, `closure`, `compartmentsVisible`                            | Tote, shoulder bag, clutch, structured, crossbody; laptop fit and capacity require measurements.          |
| Jewelry and watches     | `accessoryType`, `metalAppearance`, `stoneAppearance`, `scale`, `motif`, `placement`                                                              | Gold-tone, clear stone-like detail; never assert metal purity, stone authenticity, or brand.              |
| Headwear and scarves    | `accessoryType`, `shape`, `brim`, `wrapStyle`, `lengthClass`, `coverage`, `edgeFinish`                                                            | Wide brim, fringed edge, draped wrap; no religion or ethnicity inference.                                 |
| Belts, hosiery and ties | `accessoryType`, `widthClass`, `buckleShape`, `lengthClass`, `opacity`, `patternScale`                                                            | Narrow belt, oval buckle, opaque hosiery; size and compression remain unknown.                            |

Category applicability is validated. A bag with a trouser rise or shoes with a
neckline is rejected or corrected before persistence. Do not require every item
to emit every category's fields.

## 6. Nonvisual, verified, and contextual data

Keep the following out of image-only facts:

- Brand, product ID, SKU, GTIN, seller, exact fiber percentages, size label,
  sizing system, garment measurements with units, care instructions, material
  certification, country of manufacture, verified weather performance, and item
  condition reported by the owner.
- Price in integer minor units, currency, shipping, tax inclusion, stock,
  rating, review count, purchase URL, and retrieval time belong to a product
  offer. Unknown values remain null. A review score without its scale cannot be
  normalized safely.
- Purchase date, wear count, laundry state, repair needs, budget, climate,
  mobility or sensory needs are voluntary user data. None is inferred from
  appearance.
- “Suitable for warm undertones” is a conditional styling recommendation, not a
  permanent material property. Store it under a separate explanation tied to the
  preference revision.

Size is variant-specific and market-dependent. Preserve the original label and
sizing system rather than converting “M” to a measurement. Material, pattern,
color, and size are separate fields; verified material composition overrides a
visual guess without deleting its provenance.
[Google size specification](https://support.google.com/merchants/answer/6324492),
[material specification](https://support.google.com/merchants/answer/6324410).

## 7. Evidence, corrections, and effective values

Each populated field has a provenance entry keyed by its canonical path, such as
the apparent material attribute. An entry records the source, the state, a
confidence value, a short evidence sentence, an uncertainty sentence, the
server-issued asset reference, and the provider and model that produced it.
For example, a visual reading of apparent material could have the source
visual inference, the state observed, a confidence of about 0.6, the evidence
"Fine slub texture is visible on the sleeve", and the uncertainty "Fiber
composition cannot be determined from this image."

Identifiers in examples are descriptive placeholders, not valid API UUIDs. `source`
values: `user`, `visual_inference`, `catalog`, `derived`, `sample`. `state`:
`observed`, `reported`, `inferred`, `not_visible`, `not_applicable`, `unknown`.
Confidence describes evidence quality, not calibrated probability unless
separately validated.

Effective-value precedence is explicit user correction, verified item-specific
catalog fact where applicable, visual inference, then unknown. A user's personal
label does not prove catalog authenticity. Keep original readings for audit and
allow clearing a correction. A missing field does not count as a similarity
match. Overall confidence must not be copied blindly into every attribute's
confidence.

Corrections record path, previous value, new value, source, timestamp, and
resulting item revision. Do not infer a user's identity in the shared workspace.
Input values remain untrimmed while typing; normalize whitespace on submission,
retaining internal spaces.

## 8. Common explanation envelope

All recommendation services return an explanation alongside canonical item
references. The envelope has these parts:

- A one-sentence summary, for example "A relaxed tailored look with a
  restrained palette."
- A Why this list of two to four entries. Each entry has a reason and a list of
  evidence references. For example, "The straight trousers echo the reference
  silhouette" points to the silhouette attribute of the reference bottom piece,
  and "The warm ivory layer uses your selected warm undertone preference" points
  to the selected undertone preference.
- The inputs used, named from the supplied data, such as the reference, the
  wardrobe and the undertone.
- The differences, such as "The available jacket is shorter than the
  reference."
- The uncertainty, such as "Fabric composition is not verified."
- The source revision the explanation was written against.

Target two to four brief reasons, not hidden chain-of-thought. Evidence
references must resolve to supplied data. Empty preferences mean no
personalization claim. Public snapshots use an allowlisted projection and
exclude this profile context.

## 9. Matching contract

Match outcomes remain `owned_match`, `wardrobe_alternative`, and `missing`. They
describe reference-to-inventory relationships, not purchase status. A saved
marketplace candidate is never eligible as owned inventory.
Combined Create comparison may assess sample, archived and saved-candidate rows
when the adapter explicitly supplies them. Archived owned rows remain owned;
saved candidates can only be alternatives or missing-item references. These
comparison rules do not change eligibility for capsules, previews or saved looks.

Before scoring, require compatible category role, functional family, occasion
constraints, coverage, and garment construction where these are known. Reject a
football jersey as a substitute for an evening blouse merely because both are
black tops. An explicitly requested sport-inspired outfit can contain a jersey,
but the explanation must describe a deliberate style change; it cannot call the
jersey a close high-fashion substitute.

Return actual wardrobe ID, shared attributes, meaningful differences, evidence
coverage, rationale, confidence, source, and input revisions. Treat unknown
evidence conservatively. The deterministic service enforces eligibility; the LLM
explains or compares only eligible candidates using
[FASHION-PROMPT.md](FASHION-PROMPT.md).

## 10. Storage and compatibility mapping

| Domain           | Persisted contract                                                                                  | Mapping requirement                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Detection        | `inspiration_pieces.name/category/attributes/provenance/corrections/confidence`                     | Canonical fields in JSON; envelope metadata through parent look and asset.                                                                   |
| Wardrobe         | `wardrobe_items.name/category/color/subcategory/attributes/provenance/corrections/inventory_status` | `color` projects the effective primary color; preserve separate inference and corrections.                                                   |
| Products         | `products` plus provider metadata and offer fields                                                  | Normalize catalog facts to canonical attributes; add a structured-description field to the baseline schema if columns cannot represent them. |
| Options          | `outfit_option_items` references owned, product, or missing                                         | A structured missing item brief uses the same shape without fabricated ID or ownership.                                                      |
| Capsules         | `capsule_items`, `capsule_outfit_items`, missing additions                                          | Text and IDs only for generation; missing additions use the structured missing-item shape, never a name-only description.                    |
| Previews         | Resolved item references and operation input snapshot                                               | Canonical attributes plus authorized image references and selected profile.                                                                  |
| Saved and shared | Immutable saved snapshot; minimal public projection                                                 | Persist canonical snapshot internally; disclose only approved display fields and approved media.                                             |

Attribute JSON is validated with strict field-level schemas and an 8 KB limit
per item. Unknown values are omitted from stored attributes while their
provenance records the `unknown` or `not_visible` state. Structured provenance
and explanations live in their own fields. Inventory status and structured
missing briefs are part of the baseline schema. Use `apparentMaterial`, never a
bare `material`, and map preference keys such as `skin_depth` once at the
boundary so no value is dropped by a naming mismatch.

## 11. Validation and examples

Minimum image reading: name, category, any observed attributes, evidence, and
uncertainty. Empty unsupported details remain empty. Reject duplicate IDs,
category-specific nonsense, unrecognized source types, out-of-range confidence,
and descriptions containing instructions. Stable positions are separate from
IDs.

Example: an ivory relaxed shirt may have `pattern=solid`, `texture=slubbed`,
`apparentMaterial=linen-like`, `neckline=collared`, `sleeve=long`,
`hemShape=curved`. It must not acquire “100 percent linen,” an exact size, or a
luxury brand from that appearance. A matching football jersey fails the
functional and construction gates despite a similar ivory color.

Example: a black low-heel loafer records toe shape, upper appearance, sole and
fastening. Its leather-like surface is not proof of leather. It may serve smart
casual styling if the occasion allows it; it cannot replace sport-specific
equipment.

### Complete envelope example

This synthetic manual example shows what a complete item contains. It is not a
provider result or a record that exists in the database. Additional applicable
attributes from the dictionary follow the same pattern. A short example does not
reduce the extraction requirements for a well-visible garment.

Imagine a manually entered item named "Ivory relaxed shirt":

- Identity: schema version `fashion-item.v1`, a placeholder server-issued ID,
  category top, subcategory shirt, revision 1, source type manual, no asset, and
  inventory status owned. Its source reference is of the wardrobe kind and
  points to its own ID.
- Description: "An ivory shirt with a relaxed fit and a solid surface."
- Attributes: colors ivory, primary color ivory, pattern solid, fit relaxed,
  and apparent material empty because it was not recorded.
- Provenance: name, category, subcategory, colors, pattern and fit come from
  the user as reported facts. The description and the primary color are derived
  and reported. Apparent material is attributed to the user with the state
  unknown. No entry carries a confidence value because nothing was inferred.
- Corrections: none. Overall confidence: empty.
- Uncertainty: "Material has not been recorded."

`sourceReference.kind` is `wardrobe`, `inspiration_piece`, `product`, or
`missing_brief`. Persisted kinds carry a valid scoped ID. A missing brief
carries no invented database ID; the server associates it with its option slot.
For an unpersisted reading, the server wraps validated model attributes with
identity after allocation rather than asking the model to generate identity
fields.

### Visibility and image context

Keep extraction context beside provenance, separate from garment facts. Useful
fields are `view` (front, back, side, mixed, unknown), `visibility` (full,
partial, heavily occluded), `occlusionNotes`, `lightingNotes`, and an optional
normalized `referenceRegion` with x, y, width and height from 0 to 1. Validate
that the region stays inside the image. A region locates the garment for
evidence or repeated reading; it does not imply that a segmented image exists.
Region coordinates are optional model estimates, not a requirement to crop or
fabricate new garment assets. Unknown image context remains unknown.

## 12. Research scope

Sources establish useful separations, not a claim that the schema is an industry
standard. The detailed field set, eligibility gates, and versioning are Stylora
design decisions. Textile education treats color, fabric structure, and surface
design as distinct areas; this supports describing texture separately from
composition.
[FIT Textile and Surface Design](https://www.fitnyc.edu/academics/academic-divisions/art-and-design/textile-surface-design/).

Research reviewed on 6 November 2026. Keep provider taxonomy IDs and schema
versions independently versioned. Add a category or field only when a feature
can use it and the extraction evidence is defensible.
