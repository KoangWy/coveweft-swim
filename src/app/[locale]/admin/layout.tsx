import type { Metadata } from "next";

import { AdminShell } from "@/components/layout/admin-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
