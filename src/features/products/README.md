# Products

Owns missing-slot search, normalized offers and deterministic Value Score.

- `listLookProducts(lookId, optionId)` reads cached current-option searches without starting provider work.
- `searchLookSlot(lookId, input)` awaits one missing-slot search. Input contains `optionId`, `optionItemId`, optional `query`, `weights` and `retryKey`. A retry key is a UUID that starts one new idempotent attempt after a failed or abandoned search.
- `prefetchLookProducts(lookId)` is an awaited integration point for the operations owner. It runs at most three missing-slot searches at once. No detached worker or automatic route-entry execution is claimed.
- `attachProductCandidate(lookId, input)` delegates to the atomic database command. Input contains `optionId`, `optionItemId`, `searchId`, `productId`, and `expectedOptionRevision`; the response supplies `optionItemId` for the selection API. Attachment never selects the product.
- `importProductCandidate(productId, { sourceRevision, idempotencyKey })` imports a persisted provider image and returns `complete` only after attachment. Image failure leaves a retryable saved candidate with `importStatus: pending`. New rows always have `inventory_status: saved_candidate`.

The shared Wardrobe writer is not implemented yet. The import adapter stays in this feature and uses the reviewed database contract; replace its persistence boundary with the Owner 1 export when that contract lands.

Provider requests have a 15-second timeout, a three-request process-level pool, and a bounded wait queue. Durable search rows cache option revision and brief fingerprints. Identical concurrent queries reuse a five-minute provider response cache and its original retrieval time. Deployment-wide quotas require the shared operation runner.

Value Score uses available price, rating and title-token relevance. Mixed currencies disable the price factor; missing evidence stays null. A Google catalog destination is labeled `destinationType: catalog`, while direct merchant links are labeled `seller`.

Candidate images are fetched only from persisted Google image or SerpAPI image hosts, with public DNS addresses pinned to the HTTPS request and every redirect checked again. Decoded MIME, dimensions and bytes must fit the private Wardrobe bucket limits. The endpoint does not accept an image URL.
