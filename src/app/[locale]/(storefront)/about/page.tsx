import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PolicyArticle } from "@/features/policies/components/policy-article";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("policies.about");
  return { title: t("title"), description: t("description") };
}

export default function AboutPage() {
  return <PolicyArticle page="about" />;
}
