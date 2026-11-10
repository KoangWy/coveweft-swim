import { cx } from "@/components/ui/cx";

export type LogoMarkProps = {
  className?: string;
  /** Loops the wave, drawing it in and out. Used by the loading screen. */
  flowing?: boolean;
};

/**
 * Brand mark: a cove drawn as an open ring with a lime wave running out
 * through the opening. Decorative; the surrounding link or text names the
 * brand. Hovering a parent with the `group` class nudges the wave.
 */
export function LogoMark({ className, flowing = false }: LogoMarkProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 48 48"
      fill="none"
      className={cx("shrink-0", className)}
      focusable="false"
    >
      <rect width="48" height="48" rx="14" className="fill-navy-900" />
      <path
        d="M33.58 15.97A12.5 12.5 0 1 0 33.58 32.03"
        className="stroke-white"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M16 24q3-4.2 6 0t6 0 6 0 6 0"
        pathLength={flowing ? 1 : undefined}
        strokeDasharray={flowing ? "1 1" : undefined}
        className={cx(
          "stroke-lime-400",
          flowing
            ? "animate-wave-flow"
            : "transition-transform duration-500 ease-out-expo group-hover:translate-x-[3px]",
        )}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
