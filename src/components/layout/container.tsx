import type { ReactNode } from "react";

import { cx } from "@/components/ui/cx";

/** Horizontal page frame shared by the header, footer, and page content. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
  );
}
