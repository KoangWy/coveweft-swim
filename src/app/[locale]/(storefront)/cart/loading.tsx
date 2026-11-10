import { PageLoader } from "@/components/layout/page-loader";

/** Shown at once while the cart loads. */
export default function CartLoading() {
  return <PageLoader className="min-h-[60dvh]" />;
}
