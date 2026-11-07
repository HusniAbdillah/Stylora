"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function useSavedMediaRefresh(pending: boolean, paused: boolean) {
  const router = useRouter();
  const reads = useRef(0);
  const [stopped, setStopped] = useState(false);
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
