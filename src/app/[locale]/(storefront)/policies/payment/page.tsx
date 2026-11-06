import { PolicyPage, policyMetadata } from "@/features/policies/components/policy-page";

export function generateMetadata() {
  return policyMetadata("payment");
}

export default function PaymentPolicyPage() {
  return <PolicyPage slug="payment" />;
}
