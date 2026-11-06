import { cx } from "./cx";

/**
 * Placeholder block that matches the shape of the content being loaded. The
 * pulse stops when the user prefers reduced motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("rounded-md bg-neutral-100 motion-safe:animate-pulse", className)}
    />
  );
}
