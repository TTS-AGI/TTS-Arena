"use client";

import { Dialog } from "@base-ui-components/react/dialog";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { MODAL_IN, MODAL_OUT } from "./motion";

/**
 * The one modal the whole app uses. Built on Base UI's Dialog (focus trap, Esc
 * to close, scroll lock, ARIA) with a standardized Framer Motion entrance/exit:
 * the backdrop fades, the panel pops in with a light spring and snaps out fast —
 * quick both ways, never sluggish. AnimatePresence + keepMounted lets the exit
 * animation play before unmount.
 */

const SIZES = {
  sm: "w-[min(92vw,22rem)]",
  md: "w-[min(92vw,28rem)]",
  lg: "w-[min(94vw,42rem)]",
} as const;

export function Modal({
  open,
  onClose,
  children,
  size = "md",
  /** Centered layout (icon + title + description above body). */
  center = false,
  className = "",
  /** Set false to keep the backdrop click from closing (e.g. mid-submit). */
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: keyof typeof SIZES;
  center?: boolean;
  className?: string;
  dismissible?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o && dismissible) onClose();
      }}
    >
      <AnimatePresence>
        {open && (
          <Dialog.Portal keepMounted>
            <Dialog.Backdrop
              render={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
                  className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm"
                />
              }
            />
            <Dialog.Popup
              render={
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: MODAL_IN,
                  }}
                  exit={{
                    opacity: 0,
                    y: 4,
                    scale: 0.98,
                    transition: MODAL_OUT,
                  }}
                  className={`card fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.35)] ${
                    SIZES[size]
                  } ${center ? "text-center" : ""} ${className}`}
                />
              }
            >
              {children}
            </Dialog.Popup>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Title styled consistently across modals. Wraps Dialog.Title for a11y. */
export function ModalTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Title className={`text-lg font-semibold ${className}`}>
      {children}
    </Dialog.Title>
  );
}

/** Description styled consistently across modals. Wraps Dialog.Description. */
export function ModalDescription({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Description className={`mt-1 text-sm text-ink-3 ${className}`}>
      {children}
    </Dialog.Description>
  );
}

/** Convenience close button that wraps Dialog.Close. */
export function ModalClose({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Dialog.Close className={className}>{children}</Dialog.Close>;
}
