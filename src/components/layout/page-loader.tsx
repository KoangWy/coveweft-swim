import { useTranslations } from "next-intl";

import { cx } from "@/components/ui/cx";

import { LogoMark } from "./logo-mark";

/**
 * Branded loading screen: the logo with its wave drawing in and out. Used
 * while a page without a more specific skeleton is fetching its data.
 */
export function PageLoader({ className }: { className?: string }) {
  const t = useTranslations("common");

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx("flex flex-1 flex-col items-center justify-center gap-4 py-24", className)}
    >
      <LogoMark flowing className="size-16 animate-rise" />
      <p className="animate-rise text-small font-medium text-neutral-600 [animation-delay:150ms]">
        {t("loadingPage")}
      </p>
    </div>
  );
}
