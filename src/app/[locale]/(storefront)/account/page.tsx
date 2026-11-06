import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { AccountShell } from "@/features/account/components/account-shell";
import { ProfileForm } from "@/features/account/components/profile-form";
import { requireUser } from "@/features/account/components/session";
import { SignOutButton } from "@/features/account/components/sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const user = await requireUser("/account");
  const t = await getTranslations("account");
  const format = await getFormatter();

  return (
    <AccountShell title={t("title")} crumbs={[{ label: t("title") }]} actions={<SignOutButton />}>
      <div className="grid gap-10 lg:grid-cols-12">
        <section aria-labelledby="profile-heading" className="flex flex-col gap-5 lg:col-span-7">
          <div className="flex flex-col gap-1">
            <h2 id="profile-heading" className="text-heading font-semibold text-navy-900">
              {t("profileHeading")}
            </h2>
            <p className="text-small text-neutral-700">{t("profileIntro")}</p>
          </div>
          <ProfileForm
            initial={{
              fullName: user.fullName ?? "",
              phone: user.phone ?? "",
              defaultAddress: user.defaultAddress ?? "",
            }}
          />
        </section>
        <aside className="flex flex-col gap-4 lg:col-span-4 lg:col-start-9">
          <dl className="flex flex-col gap-4 rounded-md border border-neutral-200 bg-neutral-50 p-5">
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-neutral-600">{t("email")}</dt>
              <dd className="text-small font-medium break-all text-navy-900">{user.email}</dd>
            </div>
            {user.privacyConsentAt ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-neutral-600">{t("consent")}</dt>
                <dd className="text-small text-navy-900">
                  {t("consentValue", {
                    version: user.privacyPolicyVersion ?? "",
                    date: format.dateTime(new Date(user.privacyConsentAt), {
                      dateStyle: "medium",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }),
                  })}
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </AccountShell>
  );
}
