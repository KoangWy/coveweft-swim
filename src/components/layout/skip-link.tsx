import { useTranslations } from "next-intl";

/** First focusable element on every page; jumps past the header. */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  const t = useTranslations("common");

  return (
    <a
      href={`#${targetId}`}
      className="sr-only rounded-md bg-lime-400 px-4 py-2 font-semibold text-navy-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--z-toast)"
    >
      {t("skipToContent")}
    </a>
  );
}
