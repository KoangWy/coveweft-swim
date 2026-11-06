import Link from "next/link";

import "./globals.css";

// Rendered for paths that do not match a locale segment, so this page owns its
// own document shell and shows both languages.
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="bg-white text-navy-900">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-6">
          <p className="text-small font-semibold text-neutral-600">404</p>
          <h1 className="text-title font-bold">Page not found</h1>
          <p className="text-neutral-700">This page could not be found.</p>
          <p lang="vi" className="text-neutral-700">
            Không tìm thấy trang này.
          </p>
          <Link href="/en" className="mt-2 font-semibold underline underline-offset-2">
            COVEWEFT Swim
          </Link>
        </main>
      </body>
    </html>
  );
}
