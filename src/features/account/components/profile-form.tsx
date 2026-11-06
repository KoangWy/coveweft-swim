"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateProfileAction, type ProfileFormState } from "@/features/account/actions";

export type ProfileValues = { fullName: string; phone: string; defaultAddress: string };

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const t = useTranslations();
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {
    values: initial,
  });
  const values = state.values ?? initial;
  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(`validation.${state.fieldErrors[name]}`) : undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.code ? <FormAlert>{t(`errors.${state.code}`)}</FormAlert> : null}
      <Input
        name="fullName"
        autoComplete="name"
        label={t("account.fullName")}
        maxLength={200}
        defaultValue={values.fullName}
        error={fieldError("fullName")}
      />
      <Input
        name="phone"
        type="tel"
        autoComplete="tel"
        label={t("account.phone")}
        maxLength={30}
        defaultValue={values.phone}
        error={fieldError("phone")}
      />
      <Textarea
        name="defaultAddress"
        autoComplete="street-address"
        label={t("account.defaultAddress")}
        hint={t("account.addressHint")}
        maxLength={500}
        defaultValue={values.defaultAddress}
        error={fieldError("defaultAddress")}
      />
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? t("account.saving") : t("account.save")}
        </Button>
        <p aria-live="polite" className="text-small text-success-700">
          {state.saved && !pending ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle aria-hidden size={18} />
              {t("account.saved")}
            </span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
