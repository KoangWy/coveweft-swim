import { NotFoundView } from "@/components/layout/not-found-view";

// Rendered when a storefront page calls notFound(). Unknown URLs are handled
// by src/app/global-not-found.tsx instead.
export default function StorefrontNotFound() {
  return <NotFoundView />;
}
