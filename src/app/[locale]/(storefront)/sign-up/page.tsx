import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { loadCurrentUser } from "@/features/account/components/session";
import { AuthLayout } from "@/features/auth/components/auth-layout";
import { safeNextPath } from "@/features/auth/components/safe-next";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { Link, redirect } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signUpTitle") };
}

export default async function SignUpPage({ searchParams }: PageProps<"/[locale]/sign-up">) {
  const { next: rawNext } = await searchParams;
  const next = safeNextPath(rawNext);
  const locale = (await getLocale()) as Locale;

  if (await loadCurrentUser()) {
    redirect({ href: next, locale });
  }

  const t = await getTranslations("auth");

  return (
    <AuthLayout
      title={t("signUpTitle")}
      intro={t("signUpIntro")}
      notice={
        <>
          <p className="font-semibold">{t("fakeDataTitle")}</p>
          <p className="text-neutral-700">{t("fakeDataBody")}</p>
        </>
      }
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link
            href={`/sign-in?next=${encodeURIComponent(next)}`}
            className="font-semibold text-navy-900 underline"
          >
            {t("signIn")}
          </Link>
        </>
      }
    >
      <SignUpForm next={next} />
    </AuthLayout>
  );
}
