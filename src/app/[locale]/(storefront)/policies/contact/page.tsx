import { PolicyPage, policyMetadata } from "@/features/policies/components/policy-page";

export function generateMetadata() {
  return policyMetadata("contact");
}

export default function ContactPolicyPage() {
  return <PolicyPage slug="contact" />;
}
