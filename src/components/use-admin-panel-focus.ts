"use client";

import { useEffect } from "react";

export function useAdminPanelFocus(open: boolean, selector: string) {
  useEffect(() => {
    if (!open) return;
    const panel = document.querySelector<HTMLElement>(selector);
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex='0']",
        ) ?? [],
      ).filter((item) => item.getClientRects().length > 0);
    controls()[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0],
        last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", trap);
    return () => {
      window.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [open, selector]);
}
