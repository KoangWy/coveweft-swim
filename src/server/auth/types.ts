export type UserRole = "customer" | "admin";

export type CurrentUser = {
  id: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  phone: string | null;
  defaultAddress: string | null;
  privacyConsentAt: string | null;
  privacyPolicyVersion: string | null;
};

export type AuthSession = {
  user: { id: string; email: string | null };
  signedIn: boolean;
};
