import { PolicyPage, policyMetadata } from "@/features/policies/components/policy-page";

export function generateMetadata() {
  return policyMetadata("returns");
}

export default function ReturnsPolicyPage() {
  return <PolicyPage slug="returns" />;
}
