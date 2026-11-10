import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { StatusScreen } from "./status-screen";

/** Localized 404 content shown inside the storefront frame. */
export function NotFoundView() {
  const t = useTranslations();

  return (
    <StatusScreen
      code="404"
      title={t("notFound.title")}
      description={t("notFound.description")}
      actions={
        <>
          <Link href="/" className={buttonClasses({ size: "lg" })}>
            {t("notFound.action")}
          </Link>
          <Link href="/shop" className={buttonClasses({ variant: "outlineLight", size: "lg" })}>
            {t("nav.shop")}
          </Link>
        </>
      }
    />
  );
}
