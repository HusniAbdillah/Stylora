"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  useEffect,
  useId,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Button, Icon } from "./primitives";
import styles from "./ui.module.css";

type DialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
};

function isBackdrop(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { top, right, bottom, left } =
    event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left ||
    event.clientX >= right ||
    event.clientY < top ||
    event.clientY >= bottom
  );
}

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
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const safe = useRef<HTMLButtonElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement;
    dialog.showModal();
    safe.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.button === 0 && isBackdrop(event);
      }}
      onClick={(event) => {
        if (!busy && pressedBackdrop.current && isBackdrop(event)) onClose();
        pressedBackdrop.current = false;
      }}
    >
      <h2 id={`${id}-title`} className={styles.dialogTitle}>
        {title}
      </h2>
      {description && (
        <div id={`${id}-description`} className={styles.noticeText}>
          {description}
        </div>
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
    </dialog>
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
