"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import type { FormState } from "@/components/ui/form-errors";
import { Input } from "@/components/ui/input";
import { signInAction } from "@/features/auth/actions";

export function SignInForm({ next }: { next: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action, pending] = useActionState<FormState, FormData>(signInAction, {});
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(`validation.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate={false}>
      {state.code ? <FormAlert>{t(`errors.${state.code}`)}</FormAlert> : null}
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
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
        autoComplete="current-password"
        label={t("auth.password")}
        required
        error={fieldError("password")}
      />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
