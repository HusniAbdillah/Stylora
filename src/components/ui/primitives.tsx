import Image from "next/image";
import { Slot } from "@radix-ui/react-slot";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  ReactNode,
} from "react";
import styles from "./ui.module.css";

function classes(...names: (string | false | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
  size?: "medium" | "large";
  asChild?: boolean;
};

export function Button({
  variant = "primary",
  size = "medium",
  asChild,
  className,
  children,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      {...props}
      type={asChild ? undefined : (type ?? "button")}
      className={classes(
        styles.button,
        styles[variant],
        styles[size],
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function Chip({
  selected = false,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      data-selected={selected}
      className={classes(styles.chip, className)}
      {...props}
    />
  );
}

export const iconNames = [
  "arrowLeft",
  "arrowRight",
  "avatar",
  "bag",
  "bell",
  "bookmark",
  "briefcase",
  "check",
  "chevronDown",
  "edit",
  "external",
  "heart",
  "image",
  "info",
  "layers",
  "link",
  "menu",
  "moon",
  "pause",
  "plane",
  "plus",
  "refresh",
  "search",
  "share",
  "shirt",
  "sliders",
  "sparkle",
  "star",
  "sun",
  "swap",
  "trash",
  "upload",
  "user",
  "x",
] as const;
export type IconName = (typeof iconNames)[number] | "arrow-left" | "arrow-right" | "chevron-down";

type IconProps = HTMLAttributes<HTMLSpanElement> & {
  name: IconName;
  size?: number;
  label?: string;
};

/** A CSS mask preserves the source SVG geometry while inheriting the surrounding text color. */
export function Icon({
  name,
  size = 20,
  label,
  className,
  style,
  ...props
}: IconProps) {
  const slug = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  return (
    <span
      {...props}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      className={classes(styles.icon, className)}
      style={
        {
          "--icon-file": `url("/design/icons/${slug}.svg")`,
          "--icon-size": `${size}px`,
          ...style,
        } as CSSProperties
      }
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "owned" | "alternative" | "missing";
}) {
  const icon = ({
    owned: "check",
    alternative: "swap",
    missing: "bag",
    neutral: undefined,
  } as const)[tone];
  return (
    <span
      {...props}
      data-tone={tone}
      className={classes(styles.badge, className)}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function Logo({
  tone = "crimson",
  markOnly = false,
  className,
}: {
  tone?: "crimson" | "night" | "paper";
  markOnly?: boolean;
  className?: string;
}) {
  return (
    <Image
      unoptimized
      className={classes(styles.logo, className)}
      data-mark={markOnly}
      src={`/design/brand/${markOnly ? "mark" : "lockup"}-${tone}.svg`}
      width={markOnly ? 25 : 107}
      height={markOnly ? 32 : 44}
      alt="Stylora"
    />
  );
}

export function Skeleton({
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={classes(styles.skeleton, className)}
      style={style}
    />
  );
}

export function Toast({
  title,
  children,
  tone = "owned",
  onDismiss,
}: {
  title: string;
  children?: ReactNode;
  tone?: "owned" | "missing" | "neutral";
  onDismiss?: () => void;
}) {
  return (
    <div className={styles.toast}>
      <Icon name={tone === "owned" ? "check" : "info"} />
      <div role="status">
        <strong>{title}</strong>
        {children && <div>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notification"
          className={styles.iconButton}
          onClick={onDismiss}
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

export function StateNotice({
  title,
  children,
  action,
  icon = "info",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <section className={styles.notice}>
      <div className={styles.noticeTitle}>
        <Icon name={icon} />
        <strong>{title}</strong>
      </div>
      {children && <div className={styles.noticeText}>{children}</div>}
      {action}
    </section>
  );
}
