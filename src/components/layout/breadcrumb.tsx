import { CaretRight } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { cx } from "@/components/ui/cx";
import { Link } from "@/i18n/navigation";

export type BreadcrumbItem = { label: string; href?: string };

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
  /** Prepend a link to the home page. */
  includeHome?: boolean;
  className?: string;
};

/** Trail of parent pages. The last item is the current page. */
export function Breadcrumb({ items, includeHome = true, className }: BreadcrumbProps) {
  const t = useTranslations("nav");
  const trail = includeHome ? [{ label: t("home"), href: "/" }, ...items] : items;

  return (
    <nav aria-label={t("breadcrumb")} className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-small text-neutral-600">
        {trail.map((item, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 ? <CaretRight aria-hidden size={14} className="text-neutral-500" /> : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded-md underline-offset-2 hover:text-navy-900 hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cx(last && "font-medium text-navy-900")}
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
