"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function AdminFloatingWindow({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="admin-floating-window"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          event.key !== "Tab" ||
          event.defaultPrevented ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const element = event.currentTarget;
        // An inner modal owns its own keyboard loop; the outer dialog must not intercept it.
        if (
          event.target instanceof Element &&
          event.target.closest("dialog") !== element
        )
          return;
        const controls = Array.from(
          element.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], [tabindex]",
          ),
        ).filter(
          (control) =>
            control.tabIndex >= 0 &&
            !control.matches(":disabled") &&
            control.getClientRects().length > 0,
        );
        const first = controls[0],
          last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          element.focus();
          return;
        }
        if (
          document.activeElement === element ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="floating-titlebar">
        <h2>{title}</h2>
        <button
          type="button"
          disabled={busy}
          aria-label="Tutup jendela"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="floating-window-body">{children}</div>
    </dialog>
  );
}
