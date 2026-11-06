import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/** Text wordmark with the lime accent line. Links to the home page. */
export function Wordmark({ href = "/" }: { href?: string }) {
  const t = useTranslations("common");

  return (
    <Link
      href={href}
      aria-label={t("brandFull")}
      className="group inline-flex flex-col rounded-md py-1 text-navy-900"
    >
      <span className="text-body leading-none font-bold tracking-[0.14em] sm:text-heading-sm sm:tracking-[0.18em]">
        {t("brand")}
      </span>
      <span
        aria-hidden
        className="mt-1 h-1 w-8 rounded-md bg-lime-400 transition-[width] duration-300 ease-out group-hover:w-full"
      />
    </Link>
  );
}
