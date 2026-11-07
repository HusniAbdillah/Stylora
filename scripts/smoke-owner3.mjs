import { randomUUID } from "node:crypto";

class SmokeFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const check = (condition, code) => {
  if (!condition) throw new SmokeFailure(code);
};
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

let stage = "configuration";
let base;
let savedId;
let shareId;
let revoked = false;
let deleted = false;

async function call(path, method = "GET", body, expected = [200]) {
  let response;
  try {
    response = await fetch(new URL(path, base), {
      method,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new SmokeFailure("REQUEST_UNAVAILABLE");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new SmokeFailure("RESPONSE_NOT_JSON");
  }
  if (!expected.includes(response.status)) {
    const code = payload?.error?.code;
    throw new SmokeFailure(
      typeof code === "string" && /^[A-Z0-9_]{1,120}$/.test(code)
        ? code
        : "UNEXPECTED_HTTP_STATUS",
    );
  }
  check(
    response.headers.get("cache-control")?.includes("no-store"),
    "CACHE_BOUNDARY_MISSING",
  );
  return { status: response.status, data: payload.data, error: payload.error };
}

async function main() {
  try {
    base = new URL(process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3415");
  } catch {
    throw new SmokeFailure("BASE_URL_INVALID");
  }
  check(
    !base.username &&
      !base.password &&
      base.pathname === "/" &&
      !base.search &&
      !base.hash &&
      (base.protocol === "https:" ||
        (base.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))),
    "BASE_URL_INVALID",
  );
  const lookId = process.env.SMOKE_LOOK_ID;
  const optionId = process.env.SMOKE_OPTION_ID;
  const optionItemId = process.env.SMOKE_OPTION_ITEM_ID;
  check(
    uuid(lookId) && uuid(optionId) && uuid(optionItemId),
    "FIXTURE_IDS_REQUIRED",
  );

  stage = "outfit detail";
  const { data: detail } = await call(
    `/api/looks/${lookId}/options/${optionId}`,
  );
  check(
    detail?.look?.id === lookId &&
      detail?.option?.id === optionId &&
      detail.option.revision === 1,
    "DETAIL_FIXTURE_MISMATCH",
  );
  check(
    detail.selection === null &&
      Array.isArray(detail.slots) &&
      detail.slots.length === 1,
    "FIXTURE_MUST_BE_UNSELECTED_SINGLE_SLOT",
  );
  const slot = detail.slots[0];
  check(
    slot.category === "top" &&
      typeof slot.slotId === "string" &&
      slot.candidates?.some(
        (item) => item.optionItemId === optionItemId && item.kind === "missing",
      ),
    "MISSING_TOP_FIXTURE_REQUIRED",
  );
  console.log("PASS outfit detail and scoped synthetic slot");

  stage = "marketplace request";
  const { data: search } = await call(
    `/api/looks/${lookId}/products/search`,
    "POST",
    { optionId, optionItemId, query: "linen shirt" },
  );
  check(
    uuid(search?.id) &&
      search.optionId === optionId &&
      search.optionItemId === optionItemId &&
      search.slotId === slot.slotId &&
      Array.isArray(search.products),
    "SEARCH_RESPONSE_INVALID",
  );
  check(
    ["succeeded", "empty", "failed", "unavailable", "running"].includes(
      search.status,
    ),
    "SEARCH_STATUS_INVALID",
  );
  console.log(`PASS single marketplace attempt: ${search.status}`);

  stage = "marketplace cache";
  const { data: cache } = await call(
    `/api/looks/${lookId}/products?optionId=${optionId}`,
  );
  check(
    cache?.optionId === optionId &&
      cache.searches?.some(
        (item) => item.id === search.id && item.status === search.status,
      ),
    "SEARCH_CACHE_MISSING",
  );
  console.log("PASS cached search restored without another search request");

  let chosenItemId = optionItemId;
  if (search.status === "succeeded" && search.products.length > 0) {
    stage = "candidate attachment";
    const product = search.products[0];
    check(
      uuid(product.id) && product.category === "top",
      "PRODUCT_RESPONSE_INVALID",
    );
    const { data: attached } = await call(
      `/api/looks/${lookId}/products/attach`,
      "POST",
      {
        optionId,
        optionItemId,
        searchId: search.id,
        productId: product.id,
        expectedOptionRevision: 1,
      },
    );
    check(
      uuid(attached?.optionItemId) &&
        attached.optionId === optionId &&
        attached.slotId === slot.slotId &&
        attached.productId === product.id,
      "CANDIDATE_ATTACH_INVALID",
    );
    chosenItemId = attached.optionItemId;
    console.log("PASS provider candidate attached without ownership change");
  } else {
    console.log(
      "SKIP product attachment: retained the truthful missing candidate",
    );
  }

  stage = "selection";
  const { data: selection } = await call(
    `/api/looks/${lookId}/selection`,
    "PUT",
    {
      optionId,
      expectedRevision: 0,
      choices: [{ slotId: slot.slotId, optionItemId: chosenItemId }],
    },
  );
  check(
    selection?.revision === 1 &&
      selection.optionId === optionId &&
      selection.choices?.[0]?.optionItemId === chosenItemId,
    "SELECTION_NOT_PERSISTED",
  );
  console.log("PASS first selection revision committed");

  stage = "immutable save";
  const saveBody = {
    optionId,
    expectedRevision: 1,
    idempotencyKey: `owner3-smoke:${randomUUID()}`,
    title: "Synthetic Owner 3 smoke",
  };
  const { data: saved } = await call(
    `/api/looks/${lookId}/save`,
    "POST",
    saveBody,
  );
  check(uuid(saved?.id), "SAVE_RESPONSE_INVALID");
  savedId = saved.id;
  check(
    saved.media?.status === "queued" &&
      saved.media.imageUrl === null &&
      uuid(saved.media.operationId),
    "QUEUED_MEDIA_MISSING",
  );
  check(
    saved.items?.length === 1 &&
      saved.items[0].optionItemId === chosenItemId &&
      saved.items[0].ownedAtSave === false,
    "SNAPSHOT_COMPOSITION_INVALID",
  );
  const { data: repeated } = await call(
    `/api/looks/${lookId}/save`,
    "POST",
    saveBody,
  );
  check(
    repeated?.id === savedId &&
      repeated.media?.operationId === saved.media.operationId &&
      repeated.media.status === "queued",
    "SAVE_IDEMPOTENCY_FAILED",
  );
  console.log(
    "PASS immutable snapshot and deduplicated queued image operation",
  );

  stage = "saved collection";
  const { data: reopened } = await call(`/api/saved-looks/${savedId}`);
  check(
    reopened?.id === savedId &&
      reopened.items?.[0]?.optionItemId === chosenItemId,
    "SAVED_REOPEN_INVALID",
  );
  const { data: preparing } = await call(
    "/api/saved-looks?filter=preparing&limit=50",
  );
  check(
    preparing?.items?.some((item) => item.id === savedId) &&
      preparing.counts?.preparing >= 1,
    "PREPARING_FILTER_INVALID",
  );
  console.log("PASS saved detail and preparing collection filter");

  stage = "share publication";
  const { data: share } = await call(
    `/api/saved-looks/${savedId}/shares`,
    "POST",
    {
      catchphrase: "Synthetic smoke",
      expiresInHours: 1,
      approvedMediaIds: [],
    },
  );
  check(uuid(share?.id), "SHARE_RESPONSE_INVALID");
  shareId = share.id;
  check(
    typeof share.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(share.token),
    "SHARE_TOKEN_INVALID",
  );
  const publicPath = `/api/shared/${encodeURIComponent(share.token)}`;
  const { data: publicLook } = await call(publicPath);
  check(
    record(publicLook) &&
      Object.keys(publicLook).every((key) =>
        ["title", "catchphrase", "items", "media", "mediaStatus"].includes(key),
      ),
    "PUBLIC_PROJECTION_LEAK",
  );
  check(
    publicLook.title === saveBody.title &&
      publicLook.catchphrase === "Synthetic smoke" &&
      publicLook.items?.length === 1 &&
      publicLook.mediaStatus === "not_included" &&
      publicLook.media?.length === 0,
    "PUBLIC_PROJECTION_INVALID",
  );
  check(
    publicLook.items.every(
      (item) =>
        record(item) &&
        Object.keys(item).every((key) =>
          ["name", "category", "colors", "imageUrl"].includes(key),
        ),
    ),
    "PUBLIC_ITEM_PROJECTION_LEAK",
  );
  const { data: shared } = await call(
    "/api/saved-looks?filter=shared&limit=50",
  );
  check(
    shared?.items?.some((item) => item.id === savedId),
    "SHARED_FILTER_INVALID",
  );
  console.log("PASS reviewed public snapshot and shared collection filter");

  stage = "share revocation";
  const { data: turnedOff } = await call(`/api/shares/${shareId}`, "DELETE");
  check(turnedOff?.status === "revoked", "SHARE_REVOCATION_FAILED");
  revoked = true;
  const unavailable = await call(publicPath, "GET", undefined, [404]);
  check(
    unavailable.error?.code === "SHARE_UNAVAILABLE",
    "REVOKED_SHARE_STILL_AVAILABLE",
  );
  console.log("PASS revoked public access returns 404");

  stage = "saved cleanup";
  const { data: removed } = await call(`/api/saved-looks/${savedId}`, "DELETE");
  check(
    removed?.deleted === true && removed.id === savedId,
    "SAVED_DELETE_FAILED",
  );
  deleted = true;
  await call(`/api/saved-looks/${savedId}`, "GET", undefined, [404]);
  console.log("PASS synthetic saved look removed");
}

let failure;
try {
  await main();
} catch (error) {
  failure = {
    stage,
    code: error instanceof SmokeFailure ? error.code : "SMOKE_FAILED",
  };
} finally {
  let cleanupFailed = false;
  if (shareId && !revoked) {
    try {
      await call(`/api/shares/${shareId}`, "DELETE", undefined, [200, 404]);
    } catch {
      cleanupFailed = true;
    }
  }
  if (savedId && !deleted) {
    try {
      await call(
        `/api/saved-looks/${savedId}`,
        "DELETE",
        undefined,
        [200, 404],
      );
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed)
    failure = { stage: "cleanup", code: "SYNTHETIC_SAVED_CLEANUP_FAILED" };
}
if (failure) {
  console.error(`FAIL ${failure.stage}: ${failure.code}`);
  process.exitCode = 1;
}
