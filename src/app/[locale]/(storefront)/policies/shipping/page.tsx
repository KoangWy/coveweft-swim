import { PolicyPage, policyMetadata } from "@/features/policies/components/policy-page";

export function generateMetadata() {
  return policyMetadata("shipping");
}

export default function ShippingPolicyPage() {
  return <PolicyPage slug="shipping" />;
}
