import { CheckCircle, Prohibit, Warning, WarningCircle } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { cx } from "./cx";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "error" | "soldout";

const tones: Record<BadgeTone, string> = {
  neutral: "border-neutral-200 bg-neutral-100 text-navy-900",
  accent: "border-lime-500 bg-lime-400 text-navy-950",
  success: "border-success-200 bg-success-50 text-success-700",
  warning: "border-warning-200 bg-warning-50 text-warning-700",
  error: "border-error-200 bg-error-50 text-error-700",
  soldout: "border-soldout-200 bg-soldout-50 text-soldout-700",
};

// Status tones carry an icon so the meaning never depends on color alone.
const icons: Partial<Record<BadgeTone, ReactNode>> = {
  success: <CheckCircle aria-hidden size={14} weight="bold" />,
  warning: <Warning aria-hidden size={14} weight="bold" />,
  error: <WarningCircle aria-hidden size={14} weight="bold" />,
  soldout: <Prohibit aria-hidden size={14} weight="bold" />,
};

export type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {icons[tone]}
      {children}
    </span>
  );
}
