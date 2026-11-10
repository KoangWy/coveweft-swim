"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

/**
 * Fades content in and lifts it slightly on first render. Under reduced
 * motion the app-wide MotionConfig drops the movement.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </m.div>
  );
}
