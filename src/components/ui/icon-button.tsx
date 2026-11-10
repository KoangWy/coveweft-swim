import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Accessible name. Icon-only controls must always describe their action. */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
};

export function iconButtonClasses(size: "sm" | "md" = "md", className?: string): string {
  return cx(
    "relative inline-flex shrink-0 items-center justify-center rounded-full text-navy-900 transition-colors duration-150 hover:bg-neutral-100 active:bg-neutral-200 disabled:pointer-events-none disabled:opacity-50",
    size === "md" ? "size-10 sm:size-11" : "size-9",
    className,
  );
}

export function IconButton({
  label,
  icon,
  size = "md",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={iconButtonClasses(size, className)}
      {...props}
    >
      {icon}
    </button>
  );
}
