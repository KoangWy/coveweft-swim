import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for container deployments.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product and brand photos are published at these widths and served
    // through sized loaders, so srcset entries map to real files.
    deviceSizes: [480, 960, 1600, 2400],
    imageSizes: [],
  },
  // Keep generated instruction files out of this repository.
  agentRules: false,
  experimental: {
    // Unknown URLs are served by src/app/global-not-found.tsx, which renders
    // the localized storefront 404 on the server. The root layout lives under
    // the dynamic [locale] segment, so a regular root not-found file cannot.
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);
