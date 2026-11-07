"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type ReactNode } from "react";
import { Button, Icon } from "./primitives";
import styles from "./ui.module.css";

type DialogProps = {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
}: DialogProps & {
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          {...(!description ? { "aria-describedby": undefined } : {})}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            opener.current = document.activeElement as HTMLElement | null;
            safe.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
          {description && (
            <Dialog.Description asChild>
              <div className={styles.noticeText}>{description}</div>
            </Dialog.Description>
          )}
          {children}
          <div className={styles.dialogActions}>
            <button
              ref={safe}
              type="button"
              className={`${styles.button} ${styles.secondary} ${styles.medium}`}
              onClick={onClose}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <Button onClick={onConfirm} disabled={busy} aria-busy={busy}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  side = "right",
}: DialogProps & { side?: "right" | "left" }) {
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.drawer}
          data-side={side}
          {...(!description ? { "aria-describedby": undefined } : {})}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <header>
            <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                className={styles.iconButton}
                aria-label="Close"
                type="button"
              >
                <Icon name="x" />
              </button>
            </Dialog.Close>
          </header>
          {description && (
            <Dialog.Description asChild>
              <div>{description}</div>
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
