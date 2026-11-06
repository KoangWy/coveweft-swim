import "./globals.css";

// Rendered for paths that do not match a locale segment, so this page owns its
// own document shell.
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
          <h1 className="text-3xl font-semibold">404</h1>
          <p className="text-slate-600">This page could not be found.</p>
        </main>
      </body>
    </html>
  );
}
