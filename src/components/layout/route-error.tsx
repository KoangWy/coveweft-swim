"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { StatusScreen } from "./status-screen";

/** Error view for route segments, with retry and a way home. */
export function RouteError({
  error,
  retry,
  className,
}: {
  error: unknown;
  retry: () => void;
  /** Extra classes for the status screen, for example rounding inside a panel. */
  className?: string;
}) {
  const t = useTranslations("errorPage");
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusScreen
      code="500"
      className={className}
      title={t("title")}
      description={
        <>
          {t("description")}
          {digest ? (
            <span className="mt-2 block text-small text-white/70">
              {t("reference", { digest })}
            </span>
          ) : null}
        </>
      }
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>
            {t("retry")}
          </Button>
          <Link href="/" className={buttonClasses({ variant: "outlineLight", size: "lg" })}>
            {t("home")}
          </Link>
        </>
      }
    />
  );
}
