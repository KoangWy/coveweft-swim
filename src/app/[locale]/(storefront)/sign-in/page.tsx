import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { loadCurrentUser } from "@/features/account/components/session";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { safeNextPath } from "@/features/auth/components/safe-next";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signInTitle") };
}

export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  const { next: rawNext, reason } = await searchParams;
  const next = safeNextPath(rawNext);
  const locale = (await getLocale()) as Locale;

  if (await loadCurrentUser()) {
    redirect({ href: next, locale });
  }

  const t = await getTranslations("auth");
  const signUpHref = `/sign-up?next=${encodeURIComponent(next)}`;

  return (
    <AuthLayout
      title={t("signInTitle")}
      intro={reason === "cart" ? t("signInForCart") : t("signInIntro")}
      notice={
        <>
          <p className="font-semibold">{t("demoAccountsTitle")}</p>
          <p className="text-neutral-700">{t("demoAccountsBody")}</p>
        </>
      }
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href={signUpHref} className="font-semibold text-navy-900 underline">
            {t("createAccount")}
          </Link>
        </>
      }
    >
      <SignInForm next={next} />
    </AuthLayout>
  );
}
