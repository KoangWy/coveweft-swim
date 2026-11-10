import { Info } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { BrandImage } from "@/components/ui/brand-image";

/**
 * Shared frame of the sign-in and sign-up pages: the form on the left and a
 * photo panel with the short demo notice on the right. On small screens the
 * notice sits above the form.
 */
export function AuthLayout({
  title,
  intro,
  notice,
  children,
  footer,
}: {
  title: string;
  intro?: ReactNode;
  notice: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const t = useTranslations("common");

  return (
    <Container className="py-10 lg:py-14">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col gap-6 lg:col-span-6 lg:py-6 xl:col-span-5">
          <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-small text-navy-900 lg:hidden">
            <Info aria-hidden size={20} className="mt-px shrink-0" />
            <div className="flex flex-col gap-2">{notice}</div>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-title font-display text-navy-900 md:text-display">{title}</h1>
            {intro ? <div className="text-body text-neutral-700">{intro}</div> : null}
          </div>
          {children}
          <div className="border-t border-neutral-200 pt-5 text-small text-neutral-700">
            {footer}
          </div>
        </div>
        <aside className="relative isolate hidden min-h-[36rem] overflow-hidden rounded-xl bg-navy-950 lg:col-span-6 lg:col-start-7 lg:flex lg:flex-col lg:justify-between xl:col-span-6 xl:col-start-7">
          <div aria-hidden className="absolute inset-0 -z-10">
            <BrandImage name="underwaterSwim" sizes="50vw" priority />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgb(6_21_43/0.7),rgb(6_21_43/0.2)_45%,rgb(6_21_43/0.9))]" />
          </div>
          <p className="p-10 text-display font-display text-white">{t("tagline")}</p>
          <div className="m-6 flex items-start gap-3 rounded-lg border border-white/20 bg-navy-950/60 p-5 text-small text-white backdrop-blur-md">
            <Info aria-hidden size={20} className="mt-px shrink-0" />
            <div className="flex flex-col gap-2 [&_a]:text-white [&_p]:text-white/90">{notice}</div>
          </div>
        </aside>
      </div>
    </Container>
  );
}
