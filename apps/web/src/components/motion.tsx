"use client";

import { motion, type Transition } from "motion/react";
import type { ReactNode } from "react";

export const SOFT: Transition = { duration: 0.6, ease: [0.22, 1, 0.36, 1] };
/** Snappier transition for view switches — quick and light. */
export const SNAP: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };
export const SPRING: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 36,
};
/** Modal pop — quick, lightly springy on the way in, instant on the way out. */
export const MODAL_IN: Transition = {
  type: "spring",
  stiffness: 560,
  damping: 34,
  mass: 0.7,
};
export const MODAL_OUT: Transition = { duration: 0.12, ease: [0.4, 0, 1, 1] };

/** Fade + gentle rise. The only entrance motion we use. */
export function Rise({
  children,
  delay = 0,
  y = 12,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SOFT, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Same, but triggered on scroll into view. */
export function RiseInView({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ ...SOFT, delay }}
    >
      {children}
    </motion.div>
  );
}
