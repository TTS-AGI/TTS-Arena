"use client";

import { Toast } from "@base-ui-components/react/toast";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { SNAP } from "./motion";

/**
 * App-wide toasts (Base UI Toast). Wrap the tree in <ToastProvider> and call
 * `useToast()` for `error` / `success` / `info`. One flat card style for every
 * surface (admin + app) — status is conveyed by a small leading icon, not a
 * colored side stripe. Errors linger a bit longer so the detail is readable.
 */

type ToastType = "error" | "success" | "info";

const ICON: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};
const ICON_COLOR: Record<ToastType, string> = {
  success: "text-emerald-500",
  error: "text-accent",
  info: "text-ink-3",
};

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <AnimatePresence>
      {toasts.map((toast) => {
        const type = (toast.type as ToastType) ?? "info";
        const Icon = ICON[type];
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
                className="card pointer-events-auto w-[min(92vw,22rem)] p-3.5 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.4)]"
              />
            }
          >
            <div className="flex items-start gap-2.5">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_COLOR[type]}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <Toast.Title className="text-sm font-semibold" />
                <Toast.Description className="mt-0.5 text-sm leading-relaxed text-ink-2" />
              </div>
              <Toast.Close
                aria-label="Dismiss"
                className="-mt-0.5 -mr-0.5 shrink-0 rounded-full p-1 text-ink-4 transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
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
