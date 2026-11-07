import type { SelectHTMLAttributes } from "react";
import { Icon } from "./primitives";
import styles from "./select-field.module.css";

type SelectFieldProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "multiple" | "size"
> & {
  label?: string;
  variant?: "filled" | "outlined";
};

export function SelectField({
  label,
  variant = "filled",
  children,
  ...props
}: SelectFieldProps) {
  const Wrapper = label ? "label" : "span";
  return (
    <Wrapper
      className={styles.field}
      data-field-surface=""
      data-inset-label={label ? "" : undefined}
      data-variant={variant}
    >
      {label && <span className={styles.label}>{label}</span>}
      <select {...props}>{children}</select>
      <Icon className={styles.chevron} name="chevronDown" size={16} />
    </Wrapper>
  );
}
