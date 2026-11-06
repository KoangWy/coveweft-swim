import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link } from "@/i18n/navigation";

export default function StorefrontNotFound() {
  const t = useTranslations("notFound");

  return (
    <Container className="flex flex-1 flex-col justify-center py-16">
      <p className="mb-4 text-small font-semibold text-neutral-600 tabular-nums">404</p>
      <EmptyState
        headingLevel={1}
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/" className={buttonClasses()}>
            {t("action")}
          </Link>
        }
        className="max-w-2xl"
      />
    </Container>
  );
}
