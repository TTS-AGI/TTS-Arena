"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "./auth";
import { SNAP } from "./motion";
import { HFLogo } from "./hf-logo";

/** Header account chip: signed-out → "Sign in"; signed-in → avatar + menu. */
export function Account() {
  const { user, requireAuth, signOut } = useAuth();
  const [menu, setMenu] = useState(false);

  if (!user) {
    return (
      <button
        onClick={() => requireAuth()}
        className="flex items-center gap-1.5 rounded-full bg-fill px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-line"
      >
        <HFLogo className="h-4 w-4" /> Sign in
      </button>
    );
  }

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="relative">
      <button
        onClick={() => setMenu((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-fill py-1 pr-3 pl-1 transition-colors hover:bg-line"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-[0.65rem] font-semibold text-on-accent">
          {initials}
        </span>
        <span className="text-sm font-medium">@{user.handle}</span>
      </button>

      <AnimatePresence>
        {menu && (
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenu(false)}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={SNAP}
              className="card absolute right-0 z-50 mt-2 w-48 p-1.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.3)]"
            >
              <div className="px-2.5 py-2">
                <p className="text-sm leading-tight font-semibold">
                  {user.name}
                </p>
                <p className="tag">huggingface.co/{user.handle}</p>
              </div>
              <button
                onClick={() => {
                  signOut();
                  setMenu(false);
                }}
                className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-fill hover:text-ink"
              >
                Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
