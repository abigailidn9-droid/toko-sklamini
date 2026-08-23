import { useCallback, useEffect, useRef } from "react";

type Options = {
  restoreOnWindowFocus?: boolean;
  returnAfterClick?: boolean;
};

function otherFieldFocused(self: HTMLElement | null) {
  const active = document.activeElement;
  if (!active || active === self) return false;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  );
}

export function useScanFocus(ready = true, options: Options = {}) {
  const ref = useRef<HTMLInputElement>(null);
  const { restoreOnWindowFocus = false, returnAfterClick = false } = options;

  const focus = useCallback(
    (force = false) => {
      if (!ready && !force) return;
      const el = ref.current;
      if (!el || el.disabled) return;
      if (!force) {
        if (document.querySelector(".overlay")) return;
        if (otherFieldFocused(el)) return;
      }
      window.requestAnimationFrame(() => {
        el.focus({ preventScroll: true });
      });
    },
    [ready],
  );

  useEffect(() => {
    if (!ready) return;
    focus();
  }, [ready, focus]);

  useEffect(() => {
    if (!ready || !restoreOnWindowFocus) return;
    function onWinFocus() {
      focus();
    }
    window.addEventListener("focus", onWinFocus);
    return () => window.removeEventListener("focus", onWinFocus);
  }, [ready, restoreOnWindowFocus, focus]);

  useEffect(() => {
    if (!ready || !returnAfterClick) return;
    function onClick(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("input, textarea, select, [contenteditable='true']")) return;
      if (t.closest(".overlay, .modal")) return;
      window.setTimeout(() => focus(), 0);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [ready, returnAfterClick, focus]);

  return { ref, focus };
}
