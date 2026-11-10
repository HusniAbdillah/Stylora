"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  dismissFeedback,
  isPending,
  useFeedback,
  type Feedback,
} from "@/lib/feedback/store";
import { Toast } from "./primitives";
import styles from "./notifications.module.css";

function Notification({ item }: { item: Feedback }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || isPending(item.state) || item.state === "failed") return;
    let remaining = 5000;
    let started = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function schedule() {
      clearTimeout(timer);
      if (started) remaining -= Date.now() - started;
      started = 0;
      if (document.visibilityState !== "visible") return;
      started = Date.now();
      timer = setTimeout(
        () => dismissFeedback(item.id),
        Math.max(0, remaining),
      );
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [item.id, item.state, item.updatedAt, paused]);
  return (
    <li
      className={styles.item}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <Toast
        title={item.label}
        tone={
          item.state === "failed"
            ? "missing"
            : item.state === "complete"
              ? "owned"
              : "neutral"
        }
        pending={isPending(item.state)}
        onDismiss={() => dismissFeedback(item.id)}
        action={
          item.onRetry && item.state === "failed" ? (
            <button type="button" onClick={item.onRetry}>
              Retry
            </button>
          ) : item.href ? (
            <Link href={item.href}>View details</Link>
          ) : undefined
        }
      >
        {item.detail}
      </Toast>
    </li>
  );
}

export function NotificationCenter() {
  const pathname = usePathname();
  const workspace =
    pathname !== "/" &&
    pathname !== "/sample" &&
    !pathname.startsWith("/shared/");
  if (!workspace) return null;
  return <FeedbackViewport />;
}

export function FeedbackViewport() {
  const items = useFeedback();
  const visible = items
    .filter((item) => item.toast)
    .sort((left, right) => {
      const priority = (item: Feedback) => (item.state === "failed" ? 1 : 0);
      return (
        priority(right) - priority(left) || right.updatedAt - left.updatedAt
      );
    })
    .slice(0, 1);
  return (
    <section
      className={styles.viewport}
      aria-label="Notifications"
      tabIndex={visible.length ? 0 : undefined}
    >
      <ol className={styles.list}>
        {visible.map((item) => (
          <Notification key={item.id} item={item} />
        ))}
      </ol>
    </section>
  );
}
