import { useTranslations } from "next-intl";

import { cx } from "@/components/ui/cx";
import { Link } from "@/i18n/navigation";

import { LogoMark } from "./logo-mark";

export type WordmarkProps = {
  href?: string;
  /** `light` sets the name in white for dark surfaces such as the footer. */
  tone?: "dark" | "light";
  className?: string;
};

/** Brand mark and wide-set name. Links to the home page. */
export function Wordmark({ href = "/", tone = "dark", className }: WordmarkProps) {
  const t = useTranslations("common");

  return (
    <Link
      href={href}
      aria-label={t("brandFull")}
      className={cx(
        "group inline-flex shrink-0 items-center gap-2.5 rounded-md py-1",
        tone === "light" ? "text-white focus-visible:outline-white" : "text-navy-900",
        className,
      )}
    >
      <LogoMark className="size-9" />
      <span className="flex flex-col leading-none">
        <span className="text-body font-display tracking-[0.04em] sm:text-heading-sm sm:leading-none">
          {t("brand")}
        </span>
        <span
          className={cx(
            "mt-1 text-micro font-semibold tracking-[0.42em] uppercase",
            tone === "light" ? "text-lime-300" : "text-neutral-600",
          )}
        >
          {t("brandSuffix")}
        </span>
      </span>
    </Link>
  );
}
