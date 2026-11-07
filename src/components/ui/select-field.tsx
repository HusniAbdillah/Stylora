import type { SelectHTMLAttributes } from "react";
import { Icon } from "./primitives";
import styles from "./select-field.module.css";

type SelectFieldProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "multiple" | "size"
> & { label?: string };

export function SelectField({ label, children, ...props }: SelectFieldProps) {
  const Wrapper = label ? "label" : "span";
  return (
    <Wrapper
      className={styles.field}
      data-field-surface=""
      data-inset-label={label ? "" : undefined}
    >
      {label && <span className={styles.label}>{label}</span>}
      <select {...props}>{children}</select>
      <Icon className={styles.chevron} name="chevronDown" size={16} />
    </Wrapper>
  );
}
