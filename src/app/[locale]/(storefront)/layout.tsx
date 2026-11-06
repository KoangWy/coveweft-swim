import { StorefrontFrame } from "@/components/layout/storefront-frame";

export default function StorefrontLayout({ children }: LayoutProps<"/[locale]">) {
  return <StorefrontFrame>{children}</StorefrontFrame>;
}
