import { cx } from "@/components/ui/cx";

// Eight half-periods of a 720-unit wave across 2880 units. The strip is twice
// the viewport wide and slides by half its width, so the loop is seamless.
const WAVE = "M0 28Q180 4 360 28T720 28T1080 28T1440 28T1800 28T2160 28T2520 28T2880 28V64H0Z";

/**
 * Two drifting wave strips where the hero meets the page below. Decorative;
 * the drift stops under reduced motion.
 */
export function WaveEdge({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden",
        className,
      )}
    >
      <svg
        viewBox="0 0 2880 64"
        preserveAspectRatio="none"
        className="absolute bottom-2 left-0 h-12 w-[200%] animate-drift fill-white/25 [animation-direction:reverse] [animation-duration:22s]"
      >
        <path d={WAVE} />
      </svg>
      <svg
        viewBox="0 0 2880 64"
        preserveAspectRatio="none"
        className="absolute -bottom-px left-0 h-10 w-[200%] animate-drift fill-white"
      >
        <path d={WAVE} />
      </svg>
    </div>
  );
}
