"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PreviewStudio, type PreviewSelection, type PreviewCategory } from "./preview-studio";
import { savePreviewSelection } from "./actions";
import type { readPreview } from "./data";

export function PreviewClient({
  initial,
  category,
}: {
  initial: Awaited<ReturnType<typeof readPreview>>;
  category: PreviewCategory;
}) {
  const draft = useRef({
    draftId: initial.draftId,
    revision: initial.revision,
  });
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState("Selections saved");
  function persist(selection: PreviewSelection) {
    setStatus("Saving selection…");
    queue.current = queue.current.then(async () => {
      try {
        const result = await savePreviewSelection({
          ...draft.current,
          selection,
        });
        if (!result.ok) {
          setStatus(
            result.code === "revision_conflict"
              ? "This preview changed elsewhere. Reload to review the current selection."
              : "Selection could not be saved. Try selecting the piece again.",
          );
          return;
        }
        draft.current = { draftId: result.draftId, revision: result.revision };
        setStatus("Selections saved");
      } catch {
        setStatus(
          "Selection could not be saved. Try selecting the piece again.",
        );
      }
    });
  }
  return (
    <>
      <p role="status" className="mb-4 text-xs text-secondary">
        {initial.writesEnabled
          ? status
          : "Workspace changes are currently disabled."}
      </p>
      {!initial.items.length && (
        <p className="mb-4 rounded-xl bg-blush p-4 text-sm">
          Add owned pieces to your{" "}
          <Link href="/wardrobe" className="underline">
            wardrobe
          </Link>{" "}
          to create a preview.
        </p>
      )}
      <PreviewStudio
        items={initial.items}
        initialSelection={initial.selection}
        profileSummary={initial.profileSummary}
        readOnly={!initial.writesEnabled}
        initialCategory={category}
        onCategoryChange={(next) => {
          const url = new URL(window.location.href);
          url.searchParams.set("category", next);
          window.history.replaceState(null, "", url);
        }}
        job={{ status: "unavailable" }}
        onSelectionChange={initial.writesEnabled ? persist : undefined}
        onEditPreferences={() => {
          window.location.href = "/preferences";
        }}
      />
    </>
  );
}
