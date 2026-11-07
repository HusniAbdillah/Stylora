"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Badge, Icon } from "@/components/ui";
import styles from "./landing.module.css";

export type LandingSample = {
  imageUrl: string;
  pieces: { name: string; description: string }[];
  matches: {
    name: string;
    outcome: "owned" | "alternative" | "missing";
    imageUrl: string | null;
  }[];
};

const stages = ["Scan", "Describe", "Match", "Style and shop"] as const;
const labels = {
  owned: "In sample wardrobe",
  alternative: "Alternative",
  missing: "Missing",
} as const;

export function LandingDemo({ sample }: { sample?: LandingSample }) {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    const updateVisibility = () =>
      setPageVisible(document.visibilityState === "visible");
    update();
    updateVisibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || !visible || !pageVisible || !sample) return;
    const timer = window.setInterval(
      () => setStage((current) => (current + 1) % stages.length),
      1500,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, visible, pageVisible, sample]);

  const frame = stage;
  return (
    <div
      ref={containerRef}
      className={styles.demo}
      aria-label="Stylora process preview"
      data-stage={frame}
      data-paused={paused || !visible || !pageVisible || reducedMotion}
    >
      <div className={styles.demoCircle} />
      <Image
        src={sample?.imageUrl ?? "/design/images/inspiration-sample.webp"}
        width={380}
        height={600}
        loading="eager"
        unoptimized
        alt="Sample outfit inspiration"
        className={styles.demoPhoto}
      />
      {!sample && <span className={styles.demoLabel}>Sample unavailable</span>}
      {sample && (
        <>
          <div className={styles.scan} aria-hidden="true" />
          {sample.matches.slice(0, 3).map((match, index) => (
            <div
              key={`${match.name}-${index}`}
              className={`${styles.demoMatch} ${styles[`demoMatch${index}`]}`}
              data-visible={frame > 0 && frame < 3}
              aria-hidden={frame === 0 || frame === 3}
            >
              {match.imageUrl ? (
                <Image
                  src={match.imageUrl}
                  width={44}
                  height={44}
                  unoptimized
                  alt=""
                />
              ) : (
                <span className={styles.matchIcon}>
                  <Icon
                    name={match.outcome === "missing" ? "bag" : "shirt"}
                    size={20}
                  />
                </span>
              )}
              <div>
                <strong>{match.name}</strong>
                <p>
                  {sample.pieces.find((piece) => piece.name === match.name)
                    ?.description ?? "Sample wardrobe comparison"}
                </p>
              </div>
              <Badge tone={match.outcome}>{labels[match.outcome]}</Badge>
            </div>
          ))}
          {sample.matches.length === 0 && sample.pieces[0] && (
            <div
              className={`${styles.demoMatch} ${styles.demoMatch0}`}
              data-visible={frame > 0 && frame < 3}
              aria-hidden={frame === 0 || frame === 3}
            >
              <Icon name="shirt" />
              <div>
                <strong>{sample.pieces[0].name}</strong>
                <p>{sample.pieces[0].description}</p>
              </div>
            </div>
          )}
          {frame === 3 && (
            <div className={styles.demoDirections}>
              <span>Closest to the reference</span>
              <span>From your wardrobe</span>
              <span>Fresh alternative</span>
            </div>
          )}
          <div className={styles.demoControls}>
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              disabled={reducedMotion}
              aria-label={
                reducedMotion
                  ? "Static demonstration, reduced motion enabled"
                  : paused
                    ? "Play demonstration"
                    : "Pause demonstration"
              }
              aria-pressed={paused || reducedMotion}
            >
              <Icon name={paused ? "arrowRight" : "pause"} size={14} />
              <span>
                Demo {frame + 1} of 4
                <span className={styles.desktop}>, {stages[frame]}</span>
              </span>
            </button>
            <div
              className={styles.demoPagination}
              role="group"
              aria-label="Demonstration steps"
            >
              {stages.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  disabled={reducedMotion}
                  aria-label={`Show ${label.toLowerCase()} step`}
                  aria-current={frame === index ? "step" : undefined}
                  onClick={() => {
                    setStage(index);
                    setPaused(true);
                  }}
                >
                  <span />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
