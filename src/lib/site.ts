/** Public repository of the project, used as the contact channel for the demo. */
export const PROJECT_REPOSITORY_URL = "https://github.com/KoangWy/coveweft-swim";

/** Where visitors open a complaint, question, or account deletion request. */
export const PROJECT_CONTACT_URL = `${PROJECT_REPOSITORY_URL}/issues`;

/**
 * Version of the privacy policy shown on the privacy page. Sign-up stores the
 * version a customer agreed to, so bump it whenever the policy text changes.
 */
export const PRIVACY_POLICY_VERSION = "2026-11-14";

/** Policy pages listed in the footer, in display order. */
export const POLICY_SLUGS = [
  "shipping",
  "payment",
  "returns",
  "contact",
  "privacy",
  "terms",
] as const;

export type PolicySlug = (typeof POLICY_SLUGS)[number];

/** Main storefront categories shown in the header navigation. */
export const SHOP_CATEGORIES = ["women", "men", "kids", "accessories"] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

/** Date the store policy pages were last revised (Vietnam time). */
export const POLICIES_UPDATED_AT = "2026-11-14";
