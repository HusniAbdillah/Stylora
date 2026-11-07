"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, StateNotice } from "@/components/ui";
import { CapsuleCollection } from "./capsule-results";
import type { CapsuleResult } from "./capsule-types";
import type { CapsuleDraftState } from "./schema";

export function CapsuleCollectionScreen({
  capsules,
  draft,
}: {
  capsules: CapsuleResult[];
  draft: CapsuleDraftState | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  async function remove(id: string) {
    const capsule = capsules.find((item) => item.id === id);
    const response = await fetch(`/api/capsules/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: capsule?.revision }),
    });
    if (response.ok) router.refresh();
    else
      setMessage(
        "This capsule could not be deleted. Reload the collection to check its current revision.",
      );
  }
  return (
    <>
      {message && (
        <StateNotice title="Collection status">{message}</StateNotice>
      )}
      <CapsuleCollection
        capsules={capsules}
        onNew={() => router.push("/capsules/new?fresh=1")}
        onOpen={(id) => router.push(`/capsules/${id}`)}
        onDelete={(id) => void remove(id)}
      />
      {!capsules.length && (
        <div className="mt-6">
          <StateNotice title="Start with a purpose">
            Choose a template and owned pieces to build your first capsule.
          </StateNotice>
        </div>
      )}
      {draft && (
        <div className="my-6">
          <StateNotice
            title="Continue your saved brief"
            action={
              <Button
                variant="secondary"
                onClick={() => router.push(`/capsules/new?draftId=${draft.id}`)}
              >
                Continue draft
              </Button>
            }
          >
            Your wizard choices and {draft.brief.includedItemIds.length}{" "}
            selected pieces are saved.
          </StateNotice>
        </div>
      )}
    </>
  );
}
