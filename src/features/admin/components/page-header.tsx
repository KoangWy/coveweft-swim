import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem } from "@/components/layout/breadcrumb";

export type AdminPageHeaderProps = {
  crumbs: BreadcrumbItem[];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
};

/** Breadcrumb, page title, optional description, and page actions. */
export function AdminPageHeader({
  crumbs,
  title,
  description,
  actions,
  badge,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb includeHome={false} items={crumbs} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-title font-display text-navy-900">{title}</h1>
            {badge}
          </div>
          {description ? (
            <p className="max-w-[70ch] text-body text-neutral-700">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
