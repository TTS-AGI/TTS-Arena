"use client";

import { useState } from "react";

/** Shown for providers that don't ship their own logo. */
const DEFAULT_LOGO = "/logos/default.webp";

/**
 * Logos whose artwork already fills the square with its own (dark/colored)
 * background. These are rendered edge-to-edge — no white tile, no padding — so
 * they don't get an ugly white border. Everything else (transparent or
 * black-on-white marks) keeps the white tile for legibility in both themes.
 */
const FULL_BLEED = new Set([
  "/logos/stealth.webp",
  "/logos/openaudio.webp",
  "/logos/typecast.webp",
  "/logos/cartesia.webp",
  "/logos/gradium.webp",
  "/logos/camb.webp",
  "/logos/default.webp",
]);

/**
 * Provider logo. Most marks sit on a white rounded tile so black/transparent
 * artwork stays legible in both themes; logos that ship their own background
 * fill the tile edge-to-edge instead (see FULL_BLEED). Falls back to a neutral
 * default logo when a model has no icon (or it fails to load).
 */
export function ModelLogo({
  icon,
  className = "h-6 w-6",
}: {
  icon: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = icon && !broken ? icon : DEFAULT_LOGO;
  const fullBleed = FULL_BLEED.has(src);
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md ring-1 ring-black/5 ${className} ${
        fullBleed ? "" : "bg-white p-0.5"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        onError={() => setBroken(true)}
        className={`h-full w-full ${fullBleed ? "object-cover" : "object-contain"}`}
      />
    </span>
  );
}
