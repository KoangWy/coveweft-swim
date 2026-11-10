"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { cx } from "@/components/ui/cx";

type Phase = "idle" | "loading" | "done" | "fade";

/** Longest a bar waits for the route to change before it gives up. */
const GIVE_UP_MS = 12_000;

/** Whether a click on this link starts a client-side page change. */
function isPageLink(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    anchor.target === "_blank" ||
    anchor.hasAttribute("download")
  ) {
    return false;
  }
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return false;
  }
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

function Bar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<number | undefined>(undefined);
  const route = `${pathname}?${searchParams.toString()}`;
  const lastRoute = useRef(route);

  // Start on link clicks and same-origin GET form submissions (search).
  useEffect(() => {
    function start() {
      window.clearTimeout(timer.current);
      setPhase("loading");
      timer.current = window.setTimeout(() => setPhase("idle"), GIVE_UP_MS);
    }
    function onClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (anchor instanceof HTMLAnchorElement && isPageLink(anchor, event)) {
        start();
      }
    }
    function onSubmit(event: SubmitEvent) {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.method === "get" && !event.defaultPrevented) {
        start();
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.clearTimeout(timer.current);
    };
  }, []);

  // Finish once the new route has rendered.
  useEffect(() => {
    if (route === lastRoute.current) {
      return;
    }
    lastRoute.current = route;
    window.clearTimeout(timer.current);
    // The route is an external signal from the router; the phase follows it.
    setPhase((current) => (current === "idle" ? current : "done"));
    timer.current = window.setTimeout(() => {
      setPhase((current) => (current === "done" ? "fade" : current));
      timer.current = window.setTimeout(() => setPhase("idle"), 300);
    }, 200);
  }, [route]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-(--z-progress) h-[3px] overflow-hidden"
    >
      <div
        className={cx(
          "h-full origin-left bg-lime-400 shadow-[0_0_0_1px_rgb(6_21_43/0.08)]",
          phase === "idle" && "scale-x-0 opacity-0",
          phase === "loading" &&
            "scale-x-[0.85] transition-transform duration-[8s] ease-[cubic-bezier(0.1,0.9,0.2,1)]",
          phase === "done" && "scale-x-100 transition-transform duration-200 ease-out",
          phase === "fade" && "scale-x-100 opacity-0 transition-opacity duration-300",
        )}
      />
    </div>
  );
}

/**
 * Thin lime bar at the top of the viewport while a page change is loading.
 * Pairs with the route loading screens so a click always gets feedback.
 */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
