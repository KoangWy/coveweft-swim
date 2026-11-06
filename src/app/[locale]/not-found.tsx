import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Link } from "@/i18n/navigation";

// Fallback for not-found errors raised outside the storefront and admin
// frames, for example from the locale layout itself.
export default function LocaleNotFound() {
  const t = useTranslations("notFound");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        headingLevel={1}
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/" className={buttonClasses()}>
            {t("action")}
          </Link>
        }
      />
    </main>
  );
}
