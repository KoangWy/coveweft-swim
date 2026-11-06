"use client";

import "./globals.css";

// Last-resort boundary for errors in the root layout. Translations are not
// available here, so the page shows both languages.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="bg-white text-navy-900">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-6">
          <p className="text-small font-semibold text-neutral-600">500</p>
          <h1 className="text-title font-bold">Something went wrong</h1>
          <p className="text-neutral-700">The page could not be loaded. Please try again.</p>
          <p lang="vi" className="text-neutral-700">
            Đã có lỗi xảy ra. Vui lòng thử lại.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="mt-2 inline-flex h-11 w-fit items-center rounded-md bg-lime-400 px-5 text-small font-semibold text-navy-950 hover:bg-lime-500"
          >
            Try again / Thử lại
          </button>
        </main>
      </body>
    </html>
  );
}
