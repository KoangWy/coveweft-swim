import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Container } from "@/components/layout/container";
import { POLICIES_UPDATED_AT, PRIVACY_POLICY_VERSION, type PolicySlug } from "@/lib/site";

import { PolicyNav } from "./policy-nav";

export type PolicyPageKey = "about" | PolicySlug;

type PolicySection = {
  title: string;
  body?: string;
  items?: Record<string, string>;
};

export type PolicyArticleProps = {
  page: PolicyPageKey;
  /** ICU values available to every section, for example formatted fees. */
  values?: Record<string, string>;
  /** Rendered between the introduction and the first section. */
  beforeSections?: ReactNode;
  /** Rendered after the last section. */
  afterSections?: ReactNode;
};

/**
 * Layout for the static store pages. Section text lives in
 * `policies.<page>.sections` in the message files, so both languages share
 * one structure and the missing-key test covers them.
 */
export async function PolicyArticle({
  page,
  values = {},
  beforeSections,
  afterSections,
}: PolicyArticleProps) {
  const t = await getTranslations(`policies.${page}`);
  const tPolicies = await getTranslations("policies");
  const format = await getFormatter();
  const sections = t.raw("sections") as Record<string, PolicySection>;

  const updated = format.dateTime(new Date(`${POLICIES_UPDATED_AT}T00:00:00+07:00`), {
    dateStyle: "long",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  const trail =
    page === "about"
      ? [{ label: t("title") }]
      : [{ label: tPolicies("related") }, { label: t("title") }];

  return (
    <Container className="py-8 lg:py-12">
      <Breadcrumb items={trail} />
      <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-16">
        <article className="min-w-0 lg:col-span-8">
          <header className="flex flex-col gap-4 border-b border-neutral-200 pb-8">
            <h1 className="text-title font-bold tracking-tight text-navy-900 md:text-display">
              {t("title")}
            </h1>
            <p className="max-w-[62ch] text-lead text-neutral-700">{t("lead")}</p>
            <p className="text-small text-neutral-600">
              {page === "privacy"
                ? tPolicies("version", { version: PRIVACY_POLICY_VERSION })
                : tPolicies("updated", { date: updated })}
            </p>
          </header>
          {beforeSections ? <div className="mt-8">{beforeSections}</div> : null}
          <div className="mt-8 flex flex-col gap-10">
            {Object.entries(sections).map(([key, section]) => (
              <section key={key} aria-labelledby={`section-${key}`} className="scroll-mt-40">
                <h2 id={`section-${key}`} className="text-heading-sm font-semibold text-navy-900">
                  {t(`sections.${key}.title`)}
                </h2>
                {section.body ? (
                  <p className="mt-3 max-w-[68ch] text-body text-neutral-700">
                    {t(`sections.${key}.body`, values)}
                  </p>
                ) : null}
                {section.items ? (
                  <ul className="mt-4 flex max-w-[68ch] flex-col gap-3">
                    {Object.keys(section.items).map((item) => (
                      <li key={item} className="flex gap-3 text-body text-neutral-700">
                        <span
                          aria-hidden
                          className="mt-2.5 h-1 w-3 shrink-0 rounded-md bg-lime-500"
                        />
                        <span>{t(`sections.${key}.items.${item}`, values)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
          {afterSections ? <div className="mt-12">{afterSections}</div> : null}
        </article>
        <aside className="lg:col-span-4">
          <PolicyNav current={page} />
        </aside>
      </div>
    </Container>
  );
}
