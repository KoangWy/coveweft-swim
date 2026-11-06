import { z } from "zod";

export const SignUpInput = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(1).max(200),
  /** The browser must send `true`; the checkbox is never pre-checked. */
  consent: z.boolean().optional(),
  /** Version of the privacy policy the customer agreed to. */
  policyVersion: z.string().trim().max(50).optional(),
});

export type SignUpInput = z.infer<typeof SignUpInput>;

export const SignInInput = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(72),
});

export type SignInInput = z.infer<typeof SignInInput>;

export const UpdateProfileInput = z
  .object({
    fullName: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    defaultAddress: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      value.fullName !== undefined ||
      value.phone !== undefined ||
      value.defaultAddress !== undefined,
    { message: "Provide at least one profile field" },
  );

export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
