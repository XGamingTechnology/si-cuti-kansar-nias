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
