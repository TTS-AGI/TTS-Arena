"use client";

import { Toast } from "@base-ui-components/react/toast";
import { AnimatePresence, motion } from "motion/react";
import { SNAP } from "./motion";

/**
 * App-wide toasts (Base UI Toast). Wrap the tree in <ToastProvider> and call
 * `useToast()` for `error` / `success` / `info` helpers. Errors stay a little
 * longer than successes so the user can read the detail.
 */

type ToastType = "error" | "success" | "info";

const ACCENT: Record<ToastType, string> = {
  error: "border-l-accent",
  success: "border-l-emerald-500",
  info: "border-l-ink-3",
};

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <AnimatePresence>
      {toasts.map((toast) => {
        const type = (toast.type as ToastType) ?? "info";
        return (
          <Toast.Root
            key={toast.id}
            toast={toast}
            render={
              <motion.div
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: SNAP }}
                exit={{
                  opacity: 0,
                  scale: 0.96,
                  transition: { duration: 0.12 },
                }}
                className={`card pointer-events-auto w-[min(92vw,22rem)] border-l-4 p-4 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.4)] ${ACCENT[type]}`}
              />
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Toast.Title className="text-sm font-semibold" />
                <Toast.Description className="mt-0.5 text-sm leading-relaxed text-ink-2" />
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="-mt-1 -mr-1 shrink-0 rounded-full px-2 py-1 text-ink-3 transition-colors hover:text-ink"
              >
                ✕
              </Toast.Close>
            </div>
          </Toast.Root>
        );
      })}
    </AnimatePresence>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed top-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2.5 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

/** Returns helpers to raise toasts. Use inside <ToastProvider>. */
export function useToast() {
  const manager = Toast.useToastManager();
  return {
    error(title: string, description?: string) {
      manager.add({ type: "error", title, description, timeout: 8000 });
    },
    success(title: string, description?: string) {
      manager.add({ type: "success", title, description, timeout: 4000 });
    },
    info(title: string, description?: string) {
      manager.add({ type: "info", title, description });
    },
  };
}
