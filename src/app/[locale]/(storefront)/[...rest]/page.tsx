import { notFound } from "next/navigation";

// Unknown paths under a locale render the storefront 404 inside the shell.
export default function CatchAllPage() {
  notFound();
}
