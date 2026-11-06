import { WarningCircle } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { cx } from "./cx";

/** Error summary at the top of a form. Announced when it appears. */
export function FormAlert({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-md border border-error-200 bg-error-50 p-4 text-small text-error-700",
        className,
      )}
    >
      <WarningCircle aria-hidden size={20} className="mt-px shrink-0" />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
