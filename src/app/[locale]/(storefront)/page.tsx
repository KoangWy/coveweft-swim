import { ArrowRight } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { Link } from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <Container className="flex flex-1 flex-col justify-center py-16 lg:py-24">
      <Reveal className="flex max-w-3xl flex-col items-start gap-6">
        <span aria-hidden className="h-1.5 w-16 rounded-md bg-lime-400" />
        <h1 className="text-display font-bold tracking-tight text-navy-900">{t("title")}</h1>
        <p className="max-w-[56ch] text-lead text-neutral-700">{t("description")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/shop" className={buttonClasses({ size: "lg" })}>
            {t("shopCta")}
            <ArrowRight aria-hidden size={20} />
          </Link>
          <Link href="/about" className={buttonClasses({ variant: "secondary", size: "lg" })}>
            {t("aboutCta")}
          </Link>
        </div>
      </Reveal>
    </Container>
  );
}
