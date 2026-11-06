import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading state shaped like the product page: gallery, title, and options. */
export default function ProductLoading() {
  const t = useTranslations("common");

  return (
    <Container className="pt-6 pb-16 lg:pt-8">
      <div role="status" aria-live="polite">
        <span className="sr-only">{t("loading")}</span>
        <Skeleton className="h-5 w-64" />
        <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:gap-12">
          <div className="mx-auto w-full max-w-[18rem] sm:max-w-sm lg:col-span-7 lg:max-w-none">
            <Skeleton className="aspect-[2/3] w-full" />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-8 w-32" />
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((option) => (
                <Skeleton key={option} className="h-14" />
              ))}
            </div>
            <Skeleton className="mt-4 h-12 w-full" />
          </div>
        </div>
      </div>
    </Container>
  );
}
