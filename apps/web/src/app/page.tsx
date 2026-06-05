"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Segmented, type ViewId } from "@/components/segmented";
import { SystemTheme } from "@/components/system-theme";
import { AuthProvider } from "@/components/auth";
import { Account } from "@/components/account";
import { Arena } from "@/components/arena";
import { Leaderboard } from "@/components/leaderboard";
import { About } from "@/components/about";
import { SNAP } from "@/components/motion";

const VIEWS: ViewId[] = ["arena", "leaderboard", "about"];

function pathToView(path: string): ViewId {
  const seg = path.replace(/^\/+/, "").split("/")[0];
  return (VIEWS as string[]).includes(seg) ? (seg as ViewId) : "arena";
}

export default function Home() {
  const [view, setView] = useState<ViewId>("arena");

  // Adopt the path on first load (deep-link / refresh) and follow back/forward.
  useEffect(() => {
    setView(pathToView(window.location.pathname));
    const onPop = () => setView(pathToView(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Switch instantly via state, and push the URL without a router navigation.
  const go = useCallback((next: ViewId) => {
    setView(next);
    const path = next === "arena" ? "/" : `/${next}`;
    if (window.location.pathname !== path) {
      window.history.pushState({ view: next }, "", path);
    }
  }, []);

  return (
    <AuthProvider>
      <SystemTheme />
      <div className="min-h-dvh overflow-x-hidden">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-canvas/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
            <button
              onClick={() => go("arena")}
              className="text-[0.95rem] font-semibold tracking-tight"
            >
              TTS&nbsp;Arena
            </button>
            <Account />
          </div>
        </header>

        {/* Sub-nav */}
        <div className="mx-auto flex max-w-3xl justify-center px-5 pt-2 pb-2">
          <Segmented active={view} onChange={go} />
        </div>

        {/* View — instant state swap (URL synced separately) with a quick fade */}
        <main className="mx-auto max-w-3xl px-5 pt-8 pb-28">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: SNAP }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
            >
              {view === "arena" && <Arena />}
              {view === "leaderboard" && <Leaderboard />}
              {view === "about" && <About />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </AuthProvider>
  );
}
