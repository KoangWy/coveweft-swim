import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/**
 * Always-visible notice that the store is a study project. Rendered on every
 * storefront page as part of the sticky header.
 */
export function DemoBanner() {
  const t = useTranslations("demoBanner");

  return (
    <div className="bg-navy-900 text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <span className="shrink-0 rounded-md bg-lime-400 px-2 py-0.5 text-caption font-bold tracking-wide text-navy-950 uppercase">
          {t("label")}
        </span>
        <p className="min-w-0 flex-1 text-caption sm:text-small">
          {t("message")}{" "}
          <Link
            href="/about"
            className="font-semibold whitespace-nowrap underline underline-offset-2 hover:text-lime-300 focus-visible:outline-white"
          >
            {t("link")}
          </Link>
        </p>
      </div>
    </div>
  );
}
