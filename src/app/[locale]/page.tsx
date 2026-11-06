import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations("HomePage");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
      <p className="text-lg text-slate-600">{t("tagline")}</p>
      <p className="max-w-md text-sm text-slate-500">{t("description")}</p>
    </main>
  );
}
