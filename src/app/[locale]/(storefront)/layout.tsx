import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";

/** Storefront frame: demo banner, header, page content, and footer. */
export default function StorefrontLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
