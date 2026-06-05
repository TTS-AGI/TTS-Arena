"use client";

import { motion } from "motion/react";

export type ViewId = "arena" | "leaderboard" | "about";

const ITEMS: { id: ViewId; label: string }[] = [
  { id: "arena", label: "Arena" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "about", label: "About" },
];

/**
 * Soft pill segmented control. The active background slides between tabs via a
 * shared-layout `layoutId`. (Safe here: this control sits outside the page's
 * view-level AnimatePresence, so the two never collide.)
 */
export function Segmented({
  active,
  onChange,
}: {
  active: ViewId;
  onChange: (v: ViewId) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-sunk p-1">
      {ITEMS.map((item) => {
        const on = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-current={on ? "page" : undefined}
            className="relative rounded-full px-4 py-1.5 text-sm font-medium"
          >
            {on && (
              <motion.span
                layoutId="seg-pill"
                transition={{ type: "spring", stiffness: 460, damping: 38 }}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              />
            )}
            <span
              className={`relative transition-colors ${
                on ? "text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
