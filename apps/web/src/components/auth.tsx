"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { AnimatePresence, motion } from "motion/react";
import type { ApiUser, MeResponse } from "@ttsa/shared";
import { MODAL_IN, MODAL_OUT } from "./motion";
import { HFLogo } from "./hf-logo";

/**
 * Real Hugging Face auth, backed by /api/auth/*. `requireAuth` opens a sign-in
 * dialog whose primary action navigates to the OAuth flow; on return, `/me`
 * rehydrates the session. Generating and voting call `requireAuth` first.
 */

type AuthCtx = {
  user: ApiUser | null;
  loading: boolean;
  /** Ensure the user is signed in; returns true if already authenticated. */
  requireAuth: () => boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json() as Promise<MeResponse>)
      .then((d) => {
        if (active) setUser(d.user);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Once signed in, report the browser fingerprint (FingerprintJS) so logins
  // can be correlated for abuse investigation. Best-effort, once per session.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const FP = (await import("@fingerprintjs/fingerprintjs")).default;
        const agent = await FP.load();
        const { visitorId } = await agent.get();
        if (cancelled) return;
        await fetch("/api/auth/fingerprint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: visitorId }),
        });
      } catch {
        // ignore — fingerprinting is non-critical
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const requireAuth = useCallback((): boolean => {
    if (user) return true;
    setOpen(true);
    return false;
  }, [user]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  function startLogin() {
    // Full-page redirect into the OAuth flow; we return to the app afterwards.
    window.location.href = "/api/auth/login";
  }

  return (
    <Ctx.Provider value={{ user, loading, requireAuth, signOut }}>
      {children}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <AnimatePresence>
          {open && (
            <Dialog.Portal keepMounted>
              <Dialog.Backdrop
                render={
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm"
                  />
                }
              />
              <Dialog.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      transition: MODAL_IN,
                    }}
                    exit={{ opacity: 0, scale: 0.98, transition: MODAL_OUT }}
                    className="card fixed top-1/2 left-1/2 z-50 w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 p-6 text-center shadow-[0_24px_70px_-20px_rgba(0,0,0,0.35)]"
                  />
                }
              >
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#ff9d00]/15">
                  <HFLogo className="h-7 w-7" />
                </span>
                <Dialog.Title className="mt-4 text-lg font-semibold">
                  Sign in to vote
                </Dialog.Title>
                <Dialog.Description className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-relaxed text-ink-2">
                  Voting is tied to your Hugging Face account so every vote
                  counts once. Accounts must be at least 30 days old.
                </Dialog.Description>

                <button
                  onClick={startLogin}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ff9d00] px-4 py-2.5 text-sm font-semibold text-[#3a2a00] transition-opacity hover:opacity-90"
                >
                  <HFLogo className="h-4 w-4" /> Continue with Hugging Face
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full rounded-full px-4 py-2 text-sm text-ink-3 transition-colors hover:text-ink"
                >
                  Not now
                </button>
              </Dialog.Popup>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
