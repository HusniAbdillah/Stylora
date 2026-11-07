"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui";

const stages = [
  { label: "Scan", caption: "Reading visible clothing, never the person." },
  { label: "Describe", caption: "Clear descriptions with evidence." },
  { label: "Match", caption: "See what you own and what is missing." },
  {
    label: "Style and shop",
    caption: "Three directions and shopping for gaps.",
  },
] as const;

export function LandingDemo() {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setStage(stages.length - 1);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (paused || reducedMotion || !visible) return;
    const timer = window.setInterval(
      () => setStage((current) => (current + 1) % stages.length),
      3000,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, visible]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto w-full max-w-[580px]"
      aria-label="Illustrative Stylora demonstration"
    >
      <div className="absolute -right-4 top-6 hidden h-[88%] w-[88%] rounded-[32px] bg-blush lg:block" />
      <div className="relative overflow-hidden rounded-[24px] bg-sand shadow-xl">
        {/* The reference is a prepared design asset; no live analysis runs here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/design/images/inspiration-sample.webp"
          alt="Illustrative outfit with a trench coat, ivory shirt and dark trousers"
          className="aspect-[4/5] w-full object-cover object-top"
        />
        <div
          className="absolute inset-x-0 top-[42%] h-px bg-crimson shadow-lg shadow-crimson/40 motion-reduce:hidden"
          aria-hidden="true"
          hidden={stage !== 0}
        />
        {stage >= 1 && (
          <div className="absolute right-3 top-[14%] max-w-[68%] rounded-xl bg-paper px-3 py-2 text-[11px] shadow-lg sm:right-5 sm:text-xs">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <Icon name="shirt" className="size-4 text-crimson" />
              Ivory relaxed shirt
            </span>
            <span className="block pl-6 text-secondary">
              Linen-like finish, relaxed fit
            </span>
          </div>
        )}
        {stage >= 2 && (
          <div className="absolute left-3 top-[52%] max-w-[72%] rounded-xl bg-paper px-3 py-2 text-[11px] shadow-lg sm:left-5 sm:text-xs">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <Icon name="check" className="size-4 text-[var(--color-owned)]" />
              In your wardrobe
            </span>
            <span className="block pl-6 text-secondary">
              A useful match is already yours
            </span>
          </div>
        )}
        {stage >= 3 && (
          <div className="absolute bottom-[16%] right-3 max-w-[70%] rounded-xl bg-paper px-3 py-2 text-[11px] shadow-lg sm:right-5 sm:text-xs">
            <span className="flex items-center gap-2 font-semibold text-ink">
              <Icon name="bag" className="size-4 text-crimson" />
              Stone trench coat
            </span>
            <span className="block pl-6 text-secondary">
              A missing piece to explore
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-night/75 to-transparent px-4 pb-4 pt-14 text-paper">
          <div>
            <p className="text-xs font-medium">{stages[stage].label}</p>
            <p className="text-[11px] text-paper/85">{stages[stage].caption}</p>
          </div>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            className="flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-night/90 px-3 text-xs font-medium text-paper focus-visible:outline-paper"
            aria-label={paused ? "Play demonstration" : "Pause demonstration"}
          >
            <Icon
              name={paused ? "arrow-right" : "pause"}
              className="size-3.5"
            />
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-secondary">
        Illustrative demo with prepared sample data
      </p>
      <div
        className="mt-2 flex justify-center gap-1.5"
        role="group"
        aria-label="Demonstration steps"
      >
        {stages.map((item, index) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setStage(index);
              setPaused(true);
            }}
            className={`h-1.5 rounded-full transition-all motion-reduce:transition-none ${stage === index ? "w-7 bg-crimson" : "w-3 bg-stone"}`}
            aria-label={`Show ${item.label} step`}
            aria-current={stage === index ? "step" : undefined}
          />
        ))}
      </div>
    </div>
  );
}
