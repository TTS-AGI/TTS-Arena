"use client";

import { useEffect, useRef } from "react";
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
  const widgetRef = useRef<HTMLElement | null>(null);

  // Lazy-load the widget script once, on first open (registers <cap-widget>).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    import("@cap.js/widget/cap.min.js").catch(() => {
      // If it fails to load, the modal still shows a message; user can retry.
      if (!cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Wire the solve event.
  useEffect(() => {
    const el = widgetRef.current;
    if (!el || !open) return;
    const handler = (e: Event) => {
      const token = (e as CapSolveEvent).detail?.token;
      if (token) onSolved(token);
    };
    el.addEventListener("solve", handler as EventListener);
    return () => el.removeEventListener("solve", handler as EventListener);
  }, [open, onSolved]);

  // Remove the library's "Cap" attribution link. It lives in the widget's
  // shadow DOM with inline `!important` styles, so page CSS can't touch it —
  // we strip the `.credits` node directly and keep watching in case it
  // re-renders (the widget re-renders on state changes).
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
    // Try immediately, then poll briefly until the shadow root exists, then
    // observe it so a re-render can't bring the link back.
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

  return (
    <Modal open={open} onClose={onClose} size="sm" center>
      <ModalTitle className="text-base">Quick check</ModalTitle>
      <ModalDescription className="mx-auto mt-1 max-w-[16rem] leading-relaxed text-ink-2">
        Please verify you are a human to continue.
      </ModalDescription>
      <div className="mt-4 flex justify-center">
        {/* The widget renders its own UI and emits `solve`. Its "Cap"
            attribution link is stripped from the shadow DOM (effect above). */}
        <cap-widget
          ref={widgetRef as React.RefObject<HTMLElement>}
          data-cap-api-endpoint="/api/cap/"
        />
      </div>
    </Modal>
  );
}
