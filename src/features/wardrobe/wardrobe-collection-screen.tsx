"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button, Icon } from "@/components/ui";
import { WardrobeGrid } from "./wardrobe-grid";
import { WardrobeIntakeFlow } from "./wardrobe-intake-flow";
import { WardrobePreviewImage } from "./wardrobe-intake-storage";
import {
  rememberWardrobeCollectionHref,
  WARDROBE_RETURN_SCROLL_KEY,
  WARDROBE_RETURN_URL_KEY,
} from "./wardrobe-navigation";
import {
  displayWardrobeItem,
  wardrobeChanged,
  wardrobeRequest,
  type WardrobeDisplayItem,
} from "./client";
type WardrobeRecord = ReturnType<typeof displayWardrobeItem>;
import {
  wardrobeCategories,
  type WardrobeCategory,
  type WardrobeItemSummary,
} from "./wardrobe-types";
import { WardrobeCollectionLoading } from "./wardrobe-collection-loading";
import styles from "./wardrobe.module.css";

const viewSchema = z.object({
  category: z
    .enum(["all", "top", "bottom", "dress", "outerwear", "shoes", "accessory"])
    .catch("all"),
  status: z.enum(["owned", "saved_candidate"]).catch("owned"),
  q: z.string().max(120).catch(""),
  add: z.enum(["1"]).optional().catch(undefined),
});

type WardrobeView = z.infer<typeof viewSchema>;
const viewEvent = "stylora:wardrobe-view";

function parseView(search: string): WardrobeView {
  const params = new URLSearchParams(search);
  return viewSchema.parse({
    category: params.get("category") ?? "all",
    status: params.get("status") ?? "owned",
    q: params.get("q") ?? "",
    add: params.get("add") ?? undefined,
  });
}

function subscribeView(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(viewEvent, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(viewEvent, onChange);
  };
}

function currentSearch() {
  return window.location.search;
}

function updateView(patch: Partial<WardrobeView>) {
  const view = { ...parseView(window.location.search), ...patch };
  const url = new URL(window.location.href);
  for (const key of ["category", "status", "q", "add"])
    url.searchParams.delete(key);
  if (view.category !== "all") url.searchParams.set("category", view.category);
  if (view.status !== "owned") url.searchParams.set("status", view.status);
  if (view.q) url.searchParams.set("q", view.q);
  if (view.add) url.searchParams.set("add", view.add);
  window.history.replaceState(
    window.history.state,
    "",
    url.pathname + url.search + url.hash,
  );
  window.dispatchEvent(new Event(viewEvent));
}

function categoryCounts(records: readonly WardrobeRecord[]) {
  const counts = Object.fromEntries(
    wardrobeCategories
      .filter((category) => category.id !== "all")
      .map((category) => [category.id, 0]),
  ) as Record<WardrobeCategory, number>;
  for (const item of records) counts[item.category] += 1;
  return counts;
}

function matchesQuery(item: WardrobeRecord, query: string) {
  const text = [
    item.name,
    item.subcategory ?? "",
    ...item.fields.flatMap((field) => [field.label, field.value]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase());
}

export function WardrobeCollectionScreen({
  initialSearch = "",
  initialItems = [],
  initialError,
  writesEnabled = false,
}: {
  initialSearch?: string;
  initialItems?: WardrobeDisplayItem[];
  initialError?: string;
  writesEnabled?: boolean;
}) {
  const router = useRouter();
  const search = useSyncExternalStore(
    subscribeView,
    currentSearch,
    () => initialSearch,
  );
  const view = parseView(search);
  const [records, setRecords] = useState(() =>
    initialItems.map(displayWardrobeItem),
  );
  const [error, setError] = useState(initialError);
  const [ready, setReady] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      const result = await wardrobeRequest<{ items: WardrobeDisplayItem[] }>(
        "",
      );
      setRecords(result.items.map(displayWardrobeItem));
      setError(undefined);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your wardrobe is unavailable.",
      );
    } finally {
      setReady(true);
      setRefreshing(false);
    }
  }
  useEffect(() => {
    const reload = () => {
      void refresh();
    };
    window.addEventListener(wardrobeChanged, reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener(wardrobeChanged, reload);
      window.removeEventListener("focus", reload);
    };
  }, []);

  useEffect(() => rememberWardrobeCollectionHref(), [search]);

  useEffect(() => {
    if (!ready) return;
    try {
      const savedUrl = window.sessionStorage.getItem(WARDROBE_RETURN_URL_KEY);
      const currentUrl = window.location.pathname + window.location.search;
      if (savedUrl !== currentUrl) return;
      const savedScroll = Number(
        window.sessionStorage.getItem(WARDROBE_RETURN_SCROLL_KEY),
      );
      window.sessionStorage.removeItem(WARDROBE_RETURN_URL_KEY);
      window.sessionStorage.removeItem(WARDROBE_RETURN_SCROLL_KEY);
      if (Number.isFinite(savedScroll) && savedScroll > 0) {
        window.requestAnimationFrame(() =>
          window.scrollTo({ top: savedScroll, behavior: "instant" }),
        );
      }
    } catch {
      // Scroll restoration is optional when storage is unavailable.
    }
  }, [ready]);

  if (!ready) return <WardrobeCollectionLoading />;

  const statusItems = records.filter(
    (item) => item.inventoryStatus === view.status,
  );
  const shown = statusItems.filter(
    (item) =>
      (view.category === "all" || item.category === view.category) &&
      matchesQuery(item, view.q),
  );
  const counts = categoryCounts(statusItems);
  const openItem = (id: string) => {
    try {
      window.sessionStorage.setItem(
        WARDROBE_RETURN_URL_KEY,
        window.location.pathname + window.location.search,
      );
      window.sessionStorage.setItem(
        WARDROBE_RETURN_SCROLL_KEY,
        String(window.scrollY),
      );
    } catch {
      // Browser history still provides a route back.
    }
    router.push(`/wardrobe/${encodeURIComponent(id)}`);
  };
  const image = (item: WardrobeItemSummary) => (
    <WardrobePreviewImage
      imageKey={item.imageKey}
      fallbackUrl={item.imageUrl}
      alt=""
    />
  );

  return (
    <>
      {!writesEnabled && (
        <p role="status">
          This workspace is read only. Saved pieces are available to browse.
        </p>
      )}
      <WardrobeGrid
        items={shown}
        totalCount={statusItems.length}
        categoryCounts={counts}
        activeCategory={view.category}
        inventoryFilter={view.status}
        query={view.q}
        hasAnyItems={records.length > 0}
        renderItemImage={image}
        status={error ? "error" : "ready"}
        errorMessage={error}
        onRetry={() => void refresh()}
        onCategoryChange={(category) => updateView({ category })}
        onFilterChange={(status) => updateView({ status })}
        onQueryChange={(q) => updateView({ q })}
        onAddItem={() => updateView({ add: "1" })}
        onOpenItem={openItem}
      />

      <div className={styles.collectionFooter}>
        <Button
          variant="quiet"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <Icon name="refresh" size={16} />
          {refreshing ? "Refreshing wardrobe" : "Refresh wardrobe"}
        </Button>
        {records.some((item) => item.isSample) && (
          <p className={styles.sampleCaption}>
            Starter items are labeled sample data.
          </p>
        )}
      </div>
      <WardrobeIntakeFlow
        open={view.add === "1"}
        onClose={() => updateView({ add: undefined })}
      />
    </>
  );
}
