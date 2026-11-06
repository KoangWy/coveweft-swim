import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for container deployments.
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
