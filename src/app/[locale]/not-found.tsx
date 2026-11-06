import { useTranslations } from "next-intl";

export default function LocaleNotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
      <p className="text-slate-600">{t("description")}</p>
    </main>
  );
}
