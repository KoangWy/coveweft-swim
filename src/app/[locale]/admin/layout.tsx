import type { Metadata } from "next";

import { AdminShell } from "@/components/layout/admin-shell";
import { requireAdminPage } from "@/features/admin/components/session";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Admin frame and server-side gate. Visitors go to sign in; signed-in
 * customers go to their account page, so no admin page or service renders for
 * someone without the administrator role.
 */
export default async function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  await requireAdminPage();
  return <AdminShell>{children}</AdminShell>;
}
