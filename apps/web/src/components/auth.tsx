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
import { MODAL_IN, MODAL_OUT } from "./motion";
import { HFLogo } from "./hf-logo";

/**
 * Mocked "Sign in with Hugging Face" auth. No real OAuth — this is a frontend
 * scaffold. A successful sign-in simulates the redirect round-trip and persists
 * a fake user to localStorage so generating and voting can be gated on it.
 */

export type HFUser = { name: string; handle: string };

type AuthCtx = {
  user: HFUser | null;
  /** Open the sign-in dialog. Resolves true once signed in, false if dismissed. */
  requireAuth: () => Promise<boolean>;
  signOut: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

// Placeholder identity returned by the mocked sign-in (no real OAuth).
const FAKE_USER: HFUser = { name: "Demo User", handle: "demo-user" };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<HFUser | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(
    null,
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem("hf-user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
  }, []);

  const requireAuth = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        if (user) return resolve(true);
        setResolver(() => resolve);
        setOpen(true);
      }),
    [user],
  );

  function close(ok: boolean) {
    setOpen(false);
    setPending(false);
    resolver?.(ok);
    setResolver(null);
  }

  function signIn() {
    setPending(true);
    // Simulate the OAuth redirect round-trip.
    window.setTimeout(() => {
      setUser(FAKE_USER);
      try {
        localStorage.setItem("hf-user", JSON.stringify(FAKE_USER));
      } catch {}
      close(true);
    }, 900);
  }

  const signOut = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem("hf-user");
    } catch {}
  }, []);

  return (
    <Ctx.Provider value={{ user, requireAuth, signOut }}>
      {children}

      <Dialog.Root open={open} onOpenChange={(o) => !o && close(false)}>
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
                  Generating and voting are tied to your Hugging Face account,
                  so every vote counts once. Accounts must be at least 30 days
                  old.
                </Dialog.Description>

                <button
                  onClick={signIn}
                  disabled={pending}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#ff9d00] px-4 py-2.5 text-sm font-semibold text-[#3a2a00] transition-opacity hover:opacity-90 disabled:opacity-70"
                >
                  {pending ? (
                    <>
                      <Spinner /> Connecting…
                    </>
                  ) : (
                    <>
                      <HFLogo className="h-4 w-4" /> Continue with Hugging Face
                    </>
                  )}
                </button>
                <button
                  onClick={() => close(false)}
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

function Spinner() {
  return (
    <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
