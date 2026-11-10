import { cx } from "./cx";

/**
 * Placeholder block that matches the shape of the content being loaded. A
 * soft highlight sweeps across it; the sweep stops when the user prefers
 * reduced motion.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "rounded-md bg-neutral-100 bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.75)_50%,transparent_70%)] bg-size-[200%_100%] bg-no-repeat motion-safe:animate-shimmer",
        className,
      )}
    />
  );
}
