"use client";

import { useState } from "react";
import { Drawer } from "./dialog";
import { Icon } from "./primitives";
import styles from "./ui.module.css";

export const createSteps = [
  "Upload",
  "Review pieces",
  "Wardrobe match",
  "Outfit ideas",
  "Outfit details",
] as const;

/** Positions are zero based. Only the current and visited steps are enabled. */
export function Stepper({
  steps = createSteps,
  current,
  visited,
  onSelect,
  label = "Create progress",
}: {
  steps?: readonly string[];
  current: number;
  visited: readonly number[];
  onSelect: (index: number) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const choices = steps.map((name, index) => {
    const active = index === current;
    const complete = visited.includes(index) && !active;
    return (
      <li key={name}>
        <button
          type="button"
          data-state={active ? "active" : complete ? "done" : "future"}
          aria-current={active ? "step" : undefined}
          disabled={!active && !complete}
          onClick={() => {
            setOpen(false);
            if (!active) onSelect(index);
          }}
        >
          <span className={styles.stepNumber}>
            {complete ? <Icon name="check" size={14} /> : index + 1}
          </span>
          {name}
        </button>
      </li>
    );
  });
  return (
    <nav aria-label={label}>
      <ol className={styles.steps}>{choices}</ol>
      <div className={styles.mobileSteps}>
        <div>
          <span>
            {current + 1} of {steps.length}
          </span>
          <strong>{steps[current]}</strong>
          <button type="button" onClick={() => setOpen(true)}>
            Steps <Icon name="chevronDown" size={14} />
          </button>
        </div>
        <div className={styles.segments}>
          {steps.map((s, i) => (
            <i key={s} data-filled={i === current || visited.includes(i)} />
          ))}
        </div>
      </div>
      <Drawer title={label} open={open} onClose={() => setOpen(false)}>
        <ol className={styles.stepMenu}>{choices}</ol>
      </Drawer>
    </nav>
  );
}
