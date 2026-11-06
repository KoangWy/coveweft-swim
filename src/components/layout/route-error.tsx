"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Container } from "./container";
import { Button, buttonClasses } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { Link } from "@/i18n/navigation";

/** Error view for route segments, with retry and a way home. */
export function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errorPage");
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex flex-1 flex-col justify-center py-16">
      <p className="mb-4 text-small font-semibold text-neutral-600 tabular-nums">500</p>
      <ErrorState
        headingLevel={1}
        title={t("title")}
        description={
          <>
            {t("description")}
            {digest ? (
              <span className="mt-2 block text-small">{t("reference", { digest })}</span>
            ) : null}
          </>
        }
        action={
          <>
            <Button onClick={() => retry()}>{t("retry")}</Button>
            <Link href="/" className={buttonClasses({ variant: "secondary" })}>
              {t("home")}
            </Link>
          </>
        }
        className="max-w-2xl"
      />
    </Container>
  );
}
