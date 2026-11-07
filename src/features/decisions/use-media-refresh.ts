"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { startOperationRequest } from "@/features/operations/client";

export function useSavedMediaRefresh(
  pending: boolean,
  paused: boolean,
  operationId?: string | null,
) {
  const router = useRouter();
  const reads = useRef(0);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!pending || paused || !operationId) return;
    let mounted = true;
    startOperationRequest(operationId, `/api/avatars/${operationId}`)
      .finally(() => {
        if (mounted) router.refresh();
      })
      .catch(() => {
        /* The persisted operation is recovered on the next visit. */
      });
    return () => {
      mounted = false;
    };
  }, [pending, paused, operationId, router]);
  useEffect(() => {
    if (!pending || paused || stopped) return;
    let timer: ReturnType<typeof setTimeout>;
    function check() {
      if (reads.current >= 12) {
        setStopped(true);
        return;
      }
      if (document.visibilityState === "visible") {
        reads.current += 1;
        router.refresh();
      }
      timer = setTimeout(check, 6000);
    }
    timer = setTimeout(check, 6000);
    return () => clearTimeout(timer);
  }, [pending, paused, stopped, router]);
  return {
    stopped: pending && stopped,
    refresh() {
      reads.current = 0;
      setStopped(false);
      router.refresh();
    },
  };
}
