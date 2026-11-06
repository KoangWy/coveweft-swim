"use client";

import { RouteError } from "@/components/layout/route-error";

export default function StorefrontError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
