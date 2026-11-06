import { Info } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";

/**
 * Shared frame of the sign-in and sign-up pages: the form on the left and a
 * short demo notice beside it on large screens.
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
  return (
    <Container className="py-10 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-6 xl:col-span-5">
          <div className="flex flex-col gap-2">
            <h1 className="text-title font-bold text-navy-900">{title}</h1>
            {intro ? <div className="text-body text-neutral-700">{intro}</div> : null}
          </div>
          {children}
          <div className="border-t border-neutral-200 pt-5 text-small text-neutral-700">
            {footer}
          </div>
        </div>
        <aside className="order-first lg:order-none lg:col-span-5 lg:col-start-8">
          <div className="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-5 text-small text-navy-900">
            <Info aria-hidden size={20} className="mt-px shrink-0" />
            <div className="flex flex-col gap-2">{notice}</div>
          </div>
        </aside>
      </div>
    </Container>
  );
}
