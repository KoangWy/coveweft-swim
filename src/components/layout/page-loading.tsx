import { useTranslations } from "next-intl";

import { Skeleton } from "@/components/ui/skeleton";

import { Container } from "./container";

/** Generic loading state: breadcrumb, title, a content column, and a side panel. */
export function PageLoading() {
  const t = useTranslations("common");

  return (
    <Container className="py-8 lg:py-10">
      <div role="status" aria-live="polite">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-6 h-10 w-64" />
        <div className="mt-8 grid gap-10 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-28 w-full" />
            ))}
          </div>
          <div className="lg:col-span-4">
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    </Container>
  );
}
