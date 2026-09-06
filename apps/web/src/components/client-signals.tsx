"use client";

import { useEffect } from "react";

/**
 * Loads the client signal collector.
 *
 * The script is built per request by the backend (see /api/s/c), so this
 * component knows nothing about what gets measured — it only injects the tag
 * and stays out of the way. Everything is best-effort: if the script fails to
 * load or throws, the arena carries on exactly as before.
 *
 * Deferred to idle so it never competes with first paint or the audio the page
 * is really there to play.
 */
export function ClientSignals() {
  useEffect(() => {
    let cancelled = false;
    let el: HTMLScriptElement | null = null;

    const start = () => {
      if (cancelled) return;
      try {
        el = document.createElement("script");
        // Cache-busted per load; the backend also sends no-store.
        el.src = `/api/s/c?t=${Date.now().toString(36)}`;
        el.async = true;
        el.onerror = () => {};
        document.head.appendChild(el);
      } catch {
        // ignore — collection is never load-bearing for the arena
      }
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof w.requestIdleCallback === "function") {
      idle = w.requestIdleCallback(start, { timeout: 4000 });
    } else {
      timer = setTimeout(start, 1200);
    }

    return () => {
      cancelled = true;
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
      if (timer !== undefined) clearTimeout(timer);
      el?.remove();
    };
  }, []);

  return null;
}
