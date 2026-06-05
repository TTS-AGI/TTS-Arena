"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const DISCORD_URL = "https://discord.gg/HB8fMR6GTr";
const DISMISS_KEY = "ttsa-discord-dismissed";
const BLURPLE = "#5865F2";

/**
 * Slim Discord-blurple invite bar pinned above the app. Dismissible, with the
 * choice remembered in localStorage so it doesn't nag returning visitors.
 */
export function DiscordBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(DISMISS_KEY) !== "1");
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{ backgroundColor: BLURPLE }}
          className="relative overflow-hidden text-white"
        >
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 px-10 py-2 text-center text-sm font-medium transition-opacity hover:opacity-90"
          >
            <DiscordMark />
            <span>
              Join the community on Discord
              <span className="ml-1.5 opacity-80 max-sm:hidden">
                — help shape the arena →
              </span>
            </span>
          </a>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="absolute top-1/2 right-2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-3.5 w-3.5"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DiscordMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4 shrink-0"
      aria-hidden
    >
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127c-.598.35-1.22.645-1.873.892a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.056c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" />
    </svg>
  );
}
