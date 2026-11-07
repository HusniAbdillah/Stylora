"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button, Icon } from "@/components/ui";
import { WardrobeCategoryTabs } from "./wardrobe-controls";
import { WardrobeGrid } from "./wardrobe-grid";
import { WardrobeIntakeFlow } from "./wardrobe-intake-flow";
import { WardrobePreviewImage } from "./wardrobe-intake-storage";
import { WardrobeItemCard } from "./wardrobe-item-card";
import {
  rememberWardrobeCollectionHref,
  WARDROBE_RETURN_SCROLL_KEY,
  WARDROBE_RETURN_URL_KEY,
} from "./wardrobe-navigation";
import {
  wardrobePreviewStore,
  type WardrobePreviewRecord,
} from "./wardrobe-preview";
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
  status: z.enum(["owned", "saved_candidate", "archived"]).catch("owned"),
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

function categoryCounts(records: readonly WardrobePreviewRecord[]) {
  const counts = Object.fromEntries(
    wardrobeCategories
      .filter((category) => category.id !== "all")
      .map((category) => [category.id, 0]),
  ) as Record<WardrobeCategory, number>;
  for (const item of records) counts[item.category] += 1;
  return counts;
}

function matchesQuery(item: WardrobePreviewRecord, query: string) {
  const text = [
    item.name,
    item.subcategory ?? "",
    item.sourceName ?? "",
    ...item.fields.flatMap((field) => [field.label, field.value]),
  ]
    .join(" ")
    .toLocaleLowerCase();
  return text.includes(query.trim().toLocaleLowerCase());
}

export function WardrobeCollectionScreen({
  initialSearch = "",
}: {
  initialSearch?: string;
}) {
  const router = useRouter();
  const search = useSyncExternalStore(
    subscribeView,
    currentSearch,
    () => initialSearch,
  );
  const view = parseView(search);
  const records = wardrobePreviewStore.useValue();
  const ready = wardrobePreviewStore.useReady();

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

  const active = records.filter((item) => !item.archivedAt);
  const archived = records.filter((item) => Boolean(item.archivedAt));
  const statusItems =
    view.status === "archived"
      ? archived
      : active.filter((item) => item.inventoryStatus === view.status);
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
      {view.status === "archived" ? (
        <section className={styles.wardrobe} aria-labelledby="archived-title">
          <p className={styles.eyebrow}>Your wardrobe</p>
          <div className={styles.archiveHeading}>
            <div>
              <h1 className={styles.title} id="archived-title">
                Archived <em>pieces.</em>
              </h1>
              <p className={styles.intro}>
                These pieces stay here for reference and can be restored from
                their detail page.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                updateView({ status: "owned", category: "all", q: "" })
              }
            >
              <Icon name="arrowLeft" size={16} /> Back to wardrobe
            </Button>
          </div>
          <WardrobeCategoryTabs
            activeCategory={view.category}
            totalCount={archived.length}
            categoryCounts={counts}
            onCategoryChange={(category) => updateView({ category })}
          />
          <label className={styles.search}>
            <Icon name="search" size={18} />
            <span className={styles.srOnly}>Search archived pieces</span>
            <input
              type="search"
              value={view.q}
              maxLength={120}
              placeholder="Search archived pieces"
              onChange={(event) => updateView({ q: event.target.value })}
            />
          </label>
          {shown.length > 0 ? (
            <div className={`${styles.grid} ${styles.archiveGrid}`}>
              {shown.map((item) => (
                <WardrobeItemCard
                  key={item.id}
                  item={item}
                  onOpen={openItem}
                  renderImage={image}
                />
              ))}
            </div>
          ) : (
            <div className={styles.messageCard} role="status">
              <Icon name="layers" />
              <div>
                <strong>
                  {archived.length
                    ? "No archived pieces found"
                    : "No archived pieces yet"}
                </strong>
                <p>
                  {archived.length
                    ? "Try a different category or search."
                    : "Archived pieces will appear here, ready to restore."}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          <WardrobeGrid
            items={shown}
            totalCount={statusItems.length}
            categoryCounts={counts}
            activeCategory={view.category}
            inventoryFilter={view.status}
            query={view.q}
            hasAnyItems={active.length > 0}
            renderItemImage={image}
            localPreview
            onCategoryChange={(category) => updateView({ category })}
            onFilterChange={(status) => updateView({ status })}
            onQueryChange={(q) => updateView({ q })}
            onAddItem={() => updateView({ add: "1" })}
            onOpenItem={openItem}
          />
          <div className={styles.archiveLinkRow}>
            <Button
              variant="quiet"
              onClick={() =>
                updateView({ status: "archived", category: "all", q: "" })
              }
            >
              <Icon name="layers" size={16} /> Archived pieces (
              {archived.length})
            </Button>
            {records.some((item) => item.isSample) && (
              <span className={styles.sampleCaption}>Sample items share one photo.</span>
            )}
          </div>
        </>
      )}
      <WardrobeIntakeFlow
        open={view.add === "1"}
        onClose={() => updateView({ add: undefined })}
      />
    </>
  );
}
