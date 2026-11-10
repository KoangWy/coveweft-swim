import { CaretRight } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { cx } from "@/components/ui/cx";
import { Link } from "@/i18n/navigation";

export type BreadcrumbItem = { label: string; href?: string };

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
  /** Prepend a link to the home page. */
  includeHome?: boolean;
  /** `inverse` sets the trail in white for photo and navy backgrounds. */
  tone?: "default" | "inverse";
  className?: string;
};

/** Trail of parent pages. The last item is the current page. */
export function Breadcrumb({
  items,
  includeHome = true,
  tone = "default",
  className,
}: BreadcrumbProps) {
  const t = useTranslations("nav");
  const trail = includeHome ? [{ label: t("home"), href: "/" }, ...items] : items;
  const inverse = tone === "inverse";

  return (
    <nav aria-label={t("breadcrumb")} className={className}>
      <ol
        className={cx(
          "flex flex-wrap items-center gap-1 text-small",
          inverse ? "text-white/80" : "text-neutral-600",
        )}
      >
        {trail.map((item, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 ? (
                <CaretRight
                  aria-hidden
                  size={14}
                  className={inverse ? "text-white/70" : "text-neutral-500"}
                />
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className={cx(
                    "rounded-md underline-offset-2 hover:underline",
                    inverse
                      ? "hover:text-white focus-visible:outline-white"
                      : "hover:text-navy-900",
                  )}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cx(
                    last && "font-medium",
                    last && (inverse ? "text-white" : "text-navy-900"),
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
