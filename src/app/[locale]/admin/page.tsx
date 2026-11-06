import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { EmptyState } from "@/components/ui/states";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("placeholderTitle") };
}

export default function AdminOverviewPage() {
  const t = useTranslations("admin");

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        includeHome={false}
        items={[{ label: t("title"), href: "/admin" }, { label: t("overview") }]}
      />
      <h1 className="text-title font-bold tracking-tight text-navy-900">{t("placeholderTitle")}</h1>
      <EmptyState
        title={t("overview")}
        description={t("placeholderDescription")}
        className="bg-white"
      />
    </div>
  );
}
