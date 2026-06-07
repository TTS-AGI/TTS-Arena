"use client";

import { useCallback, useEffect, useRef } from "react";
import { Modal, ModalTitle, ModalDescription } from "./modal";

/**
 * Cap.js proof-of-work captcha in a Framer Motion modal. Shown when the server
 * asks for a captcha (first vote of a session, then risk-triggered). The widget
 * is a self-registering web component; we load it lazily on first open and read
 * the verification token off its `solve` event, then hand it back via onSolved.
 */

// The <cap-widget> element + endpoint attr are typed in src/cap.d.ts.
type CapSolveEvent = CustomEvent<{ token: string }>;

export function CapModal({
  open,
  onSolved,
  onClose,
}: {
  open: boolean;
  onSolved: (token: string) => void;
  onClose: () => void;
}) {
  // Keep the latest onSolved in a ref so the event listener is attached ONCE
  // (via the ref callback, the instant the element mounts) and never has to be
  // re-bound — re-binding on each render races with the widget, which can solve
  // speculatively and fire `solve` in the gap, so the token would be lost and
  // the user gets stuck on a "completed" captcha that never proceeds.
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;

  // Lazy-load the widget script once, on first open (registers <cap-widget>).
  useEffect(() => {
    if (!open) return;
    import("@cap.js/widget/cap.min.js").catch(() => {
      // If it fails to load, the modal still shows a message; user can retry.
    });
  }, [open]);

  // Ref callback: bind listeners the moment the element exists, unbind when it
  // unmounts. This runs before any render-driven effect, so we can't miss an
  // early `solve` from the widget's speculative cache. `cap-token` arrives via
  // the `solve` event detail; we also read it off the element as a fallback.
  const bindWidget = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const onSolve = (e: Event) => {
      const token =
        (e as CapSolveEvent).detail?.token ??
        (el as HTMLElement & { token?: string }).token;
      if (token) onSolvedRef.current(token);
    };
    el.addEventListener("solve", onSolve as EventListener);
    // The widget is remounted (key) on each open, so React tears down this node
    // and the listener with it — no explicit removal needed.
  }, []);

  // Remove the library's "Cap" attribution link. It lives in the widget's
  // shadow DOM with inline `!important` styles, so page CSS can't touch it —
  // we strip the `.credits` node directly and keep watching in case it
  // re-renders (the widget re-renders on state changes).
  const widgetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    let observer: MutationObserver | null = null;
    const strip = () => {
      const root = (widgetRef.current as Element & { shadowRoot?: ShadowRoot })
        ?.shadowRoot;
      const credit = root?.querySelector(".credits");
      if (credit) {
        credit.remove();
        return true;
      }
      return false;
    };
    const interval = setInterval(() => {
      const root = (widgetRef.current as Element & { shadowRoot?: ShadowRoot })
        ?.shadowRoot;
      strip();
      if (root && !observer) {
        observer = new MutationObserver(() => strip());
        observer.observe(root, { childList: true, subtree: true });
      }
    }, 150);
    const stop = setTimeout(() => clearInterval(interval), 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
      observer?.disconnect();
    };
  }, [open]);

  // Compose the two refs (listener-binding + shadow-DOM stripping) onto one node.
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      widgetRef.current = el;
      bindWidget(el);
    },
    [bindWidget],
  );

  return (
    <Modal open={open} onClose={onClose} size="sm" center>
      <ModalTitle className="text-base">Quick check</ModalTitle>
      <ModalDescription className="mx-auto mt-1 max-w-[16rem] leading-relaxed text-ink-2">
        Please verify you are a human to continue.
      </ModalDescription>
      <div className="mt-4 flex justify-center">
        {/* The widget renders its own UI and emits `solve`. Its "Cap"
            attribution link is stripped from the shadow DOM (effect above).
            key={open} forces a fresh widget each time the modal opens, so a
            stale "already solved" state can't suppress a new solve event. */}
        {open && (
          <cap-widget
            key="cap"
            ref={setRef}
            data-cap-api-endpoint="/api/cap/"
          />
        )}
      </div>
    </Modal>
  );
}
