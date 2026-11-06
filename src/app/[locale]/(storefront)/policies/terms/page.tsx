import { PolicyPage, policyMetadata } from "@/features/policies/components/policy-page";

export function generateMetadata() {
  return policyMetadata("terms");
}

export default function TermsPolicyPage() {
  return <PolicyPage slug="terms" />;
}
