import { PageLoader } from "@/components/layout/page-loader";

/**
 * Shown at once while the home page loads. Routes that can answer with a 404
 * (products, orders) have no loading boundary, so their status code is set
 * before the response starts streaming.
 */
export default function HomeLoading() {
  return <PageLoader className="min-h-[70dvh] bg-navy-950 [&_p]:text-white/80" />;
}
