"use client";

import { ChatCircleDots } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ModalSurface } from "@/components/ui/modal-surface";
import { usePathname } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

import { AssistantPanel } from "./assistant-panel";
import { useAssistantChat } from "./use-assistant-chat";

export type AssistantWidgetProps = {
  /** The signed-in customer, or null for a visitor. */
  userId: string | null;
};

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return desktop;
}

/**
 * Fixed shopping-assistant launcher and its panel. The panel is a bottom
 * sheet on mobile and a side drawer from `lg` up. Closing through Escape, the
 * close button, or the backdrop aborts an active answer.
 */
export function AssistantWidget({ userId }: AssistantWidgetProps) {
  const t = useTranslations("assistant");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const chat = useAssistantChat({ userId, locale, open });

  if (pathname === "/sign-in" || pathname === "/sign-up") {
    return null;
  }

  const search = typeof window === "undefined" ? "" : window.location.search;
  const signInHref = `/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`;

  function closePanel() {
    chat.abort();
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("open")}
        title={t("open")}
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-lime-400 text-navy-950 shadow-overlay transition-[background-color,transform] duration-150 ease-out hover:bg-lime-500 active:translate-y-px lg:right-6 lg:bottom-6"
      >
        <ChatCircleDots aria-hidden size={26} weight="fill" />
      </button>

      <ModalSurface
        open={open}
        onClose={closePanel}
        title={t("title")}
        closeLabel={tCommon("close")}
        variant={desktop ? "drawer-right" : "sheet"}
      >
        <AssistantPanel
          messages={chat.messages}
          pending={chat.pending}
          streamingId={chat.streamingId}
          issue={chat.issue}
          blockKind={chat.blockKind}
          remaining={chat.remaining}
          locale={locale}
          signInHref={signInHref}
          draft={draft}
          onDraftChange={setDraft}
          onSend={chat.send}
          onRetry={chat.retry}
          onDismissTooLong={chat.dismissTooLong}
        />
      </ModalSurface>
    </>
  );
}
