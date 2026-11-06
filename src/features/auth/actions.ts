"use server";

import {
  fieldErrorsFrom,
  formLocale,
  formValues,
  type FormState,
} from "@/components/ui/form-errors";
import { redirect } from "@/i18n/navigation";
import { PRIVACY_POLICY_VERSION } from "@/lib/site";
import { signIn, signOut, signUp } from "@/server/auth";

import { safeNextPath } from "./components/safe-next";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await signIn({
    email: text(formData, "email").trim(),
    password: text(formData, "password"),
  });

  if (!result.ok) {
    return {
      code: result.error.code,
      fieldErrors:
        result.error.code === "VALIDATION_ERROR" ? fieldErrorsFrom(result.error.details) : {},
      values: formValues(formData, ["email"]),
    };
  }

  const locale = formLocale(formData);
  redirect({ href: safeNextPath(formData.get("next")), locale });
  return {};
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const result = await signUp({
    email: text(formData, "email").trim(),
    password: text(formData, "password"),
    fullName: text(formData, "fullName"),
    consent: formData.get("consent") === "on",
    // The version shown next to the checkbox; the server stores it with the
    // consent time as evidence.
    policyVersion: PRIVACY_POLICY_VERSION,
  });

  if (!result.ok) {
    return {
      code: result.error.code,
      fieldErrors:
        result.error.code === "VALIDATION_ERROR"
          ? fieldErrorsFrom(result.error.details)
          : result.error.code === "CONSENT_REQUIRED"
            ? { consent: "required" }
            : {},
      values: formValues(formData, ["email", "fullName"]),
    };
  }

  const locale = formLocale(formData);
  const next = safeNextPath(formData.get("next"));
  if (!result.data.signedIn) {
    redirect({ href: `/sign-in?next=${encodeURIComponent(next)}`, locale });
  }
  redirect({ href: next, locale });
  return {};
}

export async function signOutAction(): Promise<{ ok: boolean }> {
  const result = await signOut();
  return { ok: result.ok };
}
