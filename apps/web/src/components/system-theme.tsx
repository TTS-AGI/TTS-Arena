"use client";

import { useEffect } from "react";

/**
 * Headless: keeps the `.dark` class in sync with the OS color scheme.
 * No user toggle — the app simply follows the system, live.
 */
export function SystemTheme() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle("dark", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return null;
}
