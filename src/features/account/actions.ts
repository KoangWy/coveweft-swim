"use server";

import { refresh } from "next/cache";

import { fieldErrorsFrom, formValues, type FormState } from "@/components/ui/form-errors";
import { updateProfile } from "@/server/auth";

export type ProfileFormState = FormState & { saved?: boolean };

function optional(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const values = formValues(formData, ["fullName", "phone", "defaultAddress"]);
  const result = await updateProfile({
    fullName: optional(formData, "fullName"),
    phone: optional(formData, "phone"),
    defaultAddress: optional(formData, "defaultAddress"),
  });

  if (!result.ok) {
    return {
      code: result.error.code,
      fieldErrors:
        result.error.code === "VALIDATION_ERROR" ? fieldErrorsFrom(result.error.details) : {},
      values,
    };
  }

  refresh();
  return {
    saved: true,
    values: {
      fullName: result.data.fullName ?? "",
      phone: result.data.phone ?? "",
      defaultAddress: result.data.defaultAddress ?? "",
    },
  };
}
