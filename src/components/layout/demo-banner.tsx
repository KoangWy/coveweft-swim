import { useTranslations } from "next-intl";

/**
 * One-line notice at the top of every storefront page that the store is a
 * study project. The longer explanation lives in the footer and on the
 * About this demo page.
 */
export function DemoBanner() {
  const t = useTranslations("demoBanner");

  return (
    <div className="bg-navy-950 text-white">
      <p className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-caption sm:px-6 lg:px-8">
        <span className="shrink-0 rounded-full bg-lime-400 px-2 py-px text-micro font-bold tracking-wider text-navy-950 uppercase">
          {t("label")}
        </span>
        <span className="min-w-0">{t("message")}</span>
      </p>
    </div>
  );
}
