import type { ReactNode } from "react";

import { Breadcrumb, type BreadcrumbItem } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { BrandImage } from "@/components/ui/brand-image";
import type { BrandImageName } from "@/lib/brand-images";
import type { ShopCategory } from "@/lib/site";

/** Backdrop photo for each header category; the full catalog uses the ocean. */
const GROUP_IMAGES: Record<ShopCategory | "all", BrandImageName> = {
  all: "oceanShore",
  women: "surfLines",
  men: "oceanShore",
  kids: "poolLanes",
  accessories: "underwaterSwim",
};

/** Listing header: breadcrumb, title, and result count over a water photo. */
export function ShopBanner({
  group,
  crumbs,
  title,
  children,
}: {
  group?: ShopCategory;
  crumbs: BreadcrumbItem[];
  title: string;
  /** Text under the title, such as the result count. */
  children?: ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-navy-950 text-white">
      <div aria-hidden className="absolute inset-0 -z-10">
        <BrandImage
          name={GROUP_IMAGES[group ?? "all"]}
          sizes="(min-width: 1024px) 100vw, 66vw"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/65 to-navy-950/25" />
      </div>
      <Container className="flex min-h-56 flex-col justify-end gap-3 py-8 lg:min-h-64 lg:py-10">
        <Breadcrumb items={crumbs} tone="inverse" className="mb-auto" />
        <h1 className="animate-rise text-display font-display text-white lg:text-[3.5rem] lg:leading-none">
          {title}
        </h1>
        {children}
      </Container>
    </section>
  );
}
