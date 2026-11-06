"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormAlert } from "@/components/ui/form-alert";
import type { FormState } from "@/components/ui/form-errors";
import { Input } from "@/components/ui/input";
import { signUpAction } from "@/features/auth/actions";
import { Link } from "@/i18n/navigation";
import { PRIVACY_POLICY_VERSION } from "@/lib/site";

export function SignUpForm({ next }: { next: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState<FormState, FormData>(signUpAction, {});
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(`validation.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.code ? <FormAlert>{t(`errors.${state.code}`)}</FormAlert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <Input
        name="fullName"
        autoComplete="name"
        label={t("auth.fullName")}
        required
        maxLength={200}
        defaultValue={state.values?.fullName}
        error={fieldError("fullName")}
      />
      <Input
        name="email"
        type="email"
        autoComplete="email"
        label={t("auth.email")}
        required
        defaultValue={state.values?.email}
        error={fieldError("email")}
      />
      <Input
        name="password"
        type="password"
        autoComplete="new-password"
        label={t("auth.password")}
        hint={t("auth.passwordHint")}
        required
        minLength={8}
        maxLength={72}
        error={fieldError("password")}
      />
      {/* Never pre-checked: consent must be an explicit choice. */}
      <Checkbox
        name="consent"
        label={t.rich("auth.consent", {
          privacy: (chunks) => (
            <Link
              href="/policies/privacy"
              target="_blank"
              className="font-medium underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
        hint={t("auth.consentVersion", { version: PRIVACY_POLICY_VERSION })}
        error={fieldError("consent")}
      />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("auth.creating") : t("auth.createAccount")}
      </Button>
    </form>
  );
}
