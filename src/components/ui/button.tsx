import type { ButtonHTMLAttributes } from "react";

import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[background-color,border-color,color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  // Lime is a fill only; the label stays navy.
  primary: "bg-lime-400 text-navy-950 hover:bg-lime-500",
  secondary:
    "border border-navy-900 bg-white text-navy-900 hover:bg-neutral-100 active:bg-neutral-200",
  ghost: "text-navy-900 hover:bg-neutral-100 active:bg-neutral-200",
  danger: "border border-error-700 bg-white text-error-700 hover:bg-error-50",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-small",
  md: "h-11 px-5 text-small",
  lg: "h-12 px-6 text-body",
};

/**
 * Returns the button classes so links can share the same look as buttons.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cx(base, variants[variant], sizes[size], className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...props} />;
}
