# AI runtime evaluation, 8 November 2026

## Method

The isolated comparison used the application's real prompt loader, structured
output adapters and domain validators. Description used the checked-in
`inspiration-street.webp` example. Capsule used five explicitly synthetic owned
items, three requested outfits and exact allowed preference signals. Each model
and effort combination ran once per task, sequentially. Six text requests
completed without correction. This is a diagnostic cohort, not a representative
accuracy benchmark or a latency percentile.

| Configuration       | Description | Visible pieces | Capsule | Valid first response |
| ------------------- | ----------: | -------------: | ------: | -------------------- |
| gpt-6-luna, low     |    21.919 s |              5 | 7.363 s | Both                 |
| gpt-6-luna, none    |    25.052 s |              6 | 6.808 s | Both                 |
| gpt-6.1-terra, none |    38.328 s |              7 | 9.144 s | Both                 |

All descriptions identified the blazer, cropped top, trousers, sneakers and
bag. Luna without reasoning added the necklace. Terra also identified the
sunglasses. Additional accessories explain some output length and latency;
this is not a controlled equal-length speed comparison. Keep Luna with low
reasoning as the text default. A larger model did not improve latency here.
Task-specific model, reasoning and output controls remain explicit overrides.
Settings and prompt versions participate in operation and cached-result identity.

## Image comparison

Both requests used identical three garment photographs, the same complete
visual direction, medium quality, PNG and 1024 by 1536 output. The selected
preferences were depth 3 (`#CFA080`), warm undertone, women's pear reference,
relaxed fit and relaxed minimal style. Neither request used a personal photo.

| Model               | Request duration | Input text tokens | Input image tokens | Output image tokens | Output text tokens |
| ------------------- | ---------------: | ----------------: | -----------------: | ------------------: | -----------------: |
| gpt-image-1.5       |         18.532 s |             4,978 |             19,302 |               1,584 |                359 |
| gpt-image-2.6-flare |          8.345 s |             4,954 |                900 |               1,132 |                  0 |

Both returned valid portrait PNGs. Visual inspection found the white graphic
tee, blue denim skirt and grey runners present, with no extra selected category.
Flare retained the front print and untucked relaxed tee more closely in this
pair. Both depicted an illustrative mannequin with an approximate pear profile;
lighting and shading mean the rendered skin cannot be judged by a single pixel
hex comparison. This does not establish physical fit accuracy or reliable
preference compliance across different bodies and garments.

Using published uncached token rates and returned usage, estimated request costs
are about $0.234 for 1.5 and $0.066 for Flare. These include input references,
which a flat per-image output price omits. They are estimates, not invoices or
guaranteed future prices. No cached-token discount was reported for this pair.

The image default is now Flare after the isolated comparison and successful
saved-look execution in the local app. Existing explicit environment values
remain authoritative; `gpt-image-1.5` is an explicit rollback option. Broader
garment and preference evaluation is still required before claiming general
visual superiority. The adapter captures the actual model and omits legacy `input_fidelity` for
2.x models. It retains high fidelity for 1.5 and low for the mini model. Changing
the model or quality changes render identity. No automatic model fallback hides
a configuration or quality change.

## Personalization regression and prompt repair

The real Preview preference-change journey exposed a visual failure that PNG
and persistence checks had missed: depth 6 (`#543526`) was present in the exact
captured visual direction, but avatar prompt v4 still produced a light mannequin.
That image is a failed personalization example, despite successful API/storage
states. Prompt v5 now closes with plain-language material color, body and fit
requirements, and explicitly separates garment references from wearer appearance.
Its version participates in cache identity, so v4 images are not reused for v5.

The same captured garments and deep-swatch preferences were then rendered once
with each provider. Flare took 8.919 seconds and 1.5 took 17.541 seconds. Both
produced visibly dark mannequin material while retaining the red/white/navy tee,
pink denim and white sneakers. Flare also kept the featureless, earless head;
1.5 introduced ears in this sample. Body proportions and oversized styling remain
approximate. This second pair tests the repaired prompt, not a general success
rate across all preference combinations.

The final production-build Preview journey also produced a visibly dark,
featureless mannequin from the same saved selections and depth-6 preferences.
Its one paid image request completed during a controlled worker/app restart
test. The persisted operation duration was 93.815 seconds, including queued
time, the interruption and storage; the adapter does not persist an isolated
image-provider duration. That number is not comparable with the isolated
8.919-second provider request. Save returned the existing immutable saved-look
snapshot without another image call. Existing saved images retain their
original render until an explicit new-image request.

## Recommendation claim regression

One of the three real outfit options after a preference change included the
prompt's absent-preferences guidance despite supplied preferences and claimed
preference inputs. This is a content failure that schema validation alone did
not catch. The outfit composition validator now rejects that specific template
when preferences are present, using the existing bounded correction path. The
request also states preference availability explicitly. Create runtime v10
versions this change; output prose is not silently rewritten. Regression tests
cover empty, supplied and embedded-template cases. This finite check does not
prove that arbitrary recommendation prose is factually consistent.

## Local production HTTP timings

The external `production-evaluation/http-timings.json` records three sequential
GET requests per route against the local Next.js production server on port
3114, using hosted `dev-owner-4` data. All 18 responses returned HTTP 200.
Both durations start immediately before the request: headers measures receipt
of response headers; body complete includes consuming the streamed response.
The ranges below retain all three samples, including the first request.

| Route             | Samples | Headers received (ms) | Body complete (ms) | Body bytes read |
| ----------------- | ------: | --------------------: | -----------------: | --------------: |
| Landing           |       3 |                24–102 |             27–112 |          46,807 |
| Wardrobe          |       3 |                 30–39 |            537–687 |         147,472 |
| Create draft      |       3 |                 14–26 |              17–27 |          28,020 |
| Capsule detail    |       3 |                 15–20 |            790–910 |          77,755 |
| Preview draft     |       3 |                 18–21 |        1,274–1,387 |         155,495 |
| Saved-look detail |       3 |                 23–30 |        1,200–1,267 |          71,948 |

These measurements describe local HTTP delivery and streamed data completion.
Browser rendering, hydration, image loading and interaction latency were not
measured. They establish neither Core Web Vitals nor deployed production
latency, and three samples cannot establish a latency percentile or an
improvement over an unmeasured baseline.

## Environment and evidence

The initial local environment snapshot had Luna configured for both text
aliases, image 1.5, medium quality, inline execution and no worker secret.
The evaluation app and worker later used process-only worker configuration;
individual provider receipts record the model and settings actually used.
Production environment values were not accessible. Research artifacts and
provider receipts remain outside the repository; reports exclude credentials
and signed URLs. The operational activation steps are in
[AI-WORKER.md](AI-WORKER.md).

## Sources

- [Model selection](https://developers.openai.com/api/docs/guides/model-selection)
- [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
- [Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)
- [Image 1.5 pricing and status](https://developers.openai.com/api/docs/models/gpt-image-1.5)
- [Image 2.6 Flare pricing](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)
- [Image editing parameters](https://developers.openai.com/api/reference/python/resources/images/methods/edit)
