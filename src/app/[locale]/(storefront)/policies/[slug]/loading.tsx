import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading state shaped like a policy page: breadcrumb, title, introduction,
 * sections, and the side navigation.
 */
export default function PolicyLoading() {
  const t = useTranslations("common");

  return (
    <Container className="py-8 lg:py-12">
      <div role="status" aria-live="polite">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-5 w-48" />
        <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-full max-w-xl" />
            <Skeleton className="h-6 w-2/3 max-w-lg" />
            <Skeleton className="h-4 w-40" />
            {[0, 1, 2].map((section) => (
              <div key={section} className="mt-8 flex flex-col gap-3">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-4">
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </div>
    </Container>
  );
}
