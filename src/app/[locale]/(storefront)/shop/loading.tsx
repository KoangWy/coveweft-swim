import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading state shaped like the listing: banner, filter column, and card grid. */
export default function ShopLoading() {
  const t = useTranslations("common");

  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <div className="bg-navy-950">
        <Container className="flex min-h-56 flex-col justify-end gap-3 py-8 lg:min-h-64 lg:py-10">
          <div className="mb-auto h-5 w-40 rounded-md bg-navy-800" />
          <div className="h-12 w-64 rounded-md bg-navy-800" />
          <div className="h-5 w-28 rounded-md bg-navy-800" />
        </Container>
      </div>
      <Container className="py-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="hidden flex-col gap-4 lg:flex">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, card) => (
              <div key={card} className="flex flex-col gap-3">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
