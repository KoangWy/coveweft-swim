"use client";

import { ArrowsOutSimple, ChatCircleDots, Plus } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/layout/logo-mark";
import { IconButton } from "@/components/ui/icon-button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

import { ASSISTANT_OPEN_EVENT } from "./assistant-events";
import { AssistantPanel } from "./assistant-panel";
import { useAssistant } from "./assistant-provider";

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

function hidesWidget(pathname: string): boolean {
  return pathname === "/sign-in" || pathname === "/sign-up" || pathname.startsWith("/assistant");
}

/**
 * Fixed shopping-assistant launcher and its panel. The panel is a bottom
 * sheet of fixed height on mobile and a floating window from `lg` up. It
 * shares its transcript with the Assistant page, so closing it, expanding it,
 * or changing the URL never stops an answer that is still streaming.
 */
export function AssistantWidget() {
  const t = useTranslations("assistant");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const desktop = useDesktop();
  const chat = useAssistant();
  const {
    panelOpen,
    openPanel,
    closePanel,
    prefetchStatus,
    conversationId,
    draft,
    setDraft,
    startNew,
  } = chat;
  const hidden = hidesWidget(pathname);

  useEffect(() => {
    function onOpenRequest() {
      openPanel();
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, onOpenRequest);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onOpenRequest);
  }, [openPanel]);

  useEffect(() => {
    if (hidden) {
      closePanel();
    }
  }, [hidden, closePanel]);

  if (hidden) {
    return null;
  }

  const search = typeof window === "undefined" ? "" : window.location.search;
  const signInHref = `/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`;

  function expand() {
    closePanel();
    router.push(conversationId ? `/assistant/${conversationId}` : "/assistant");
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={panelOpen}
        aria-label={t("open")}
        title={t("open")}
        onPointerEnter={prefetchStatus}
        onFocus={prefetchStatus}
        onClick={openPanel}
        className="group fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-(--z-launcher) inline-flex size-14 shrink-0 animate-rise items-center justify-center rounded-full bg-lime-400 text-navy-950 shadow-overlay transition-[background-color,transform] duration-200 ease-out hover:scale-105 hover:bg-lime-500 active:scale-95 lg:right-6 lg:bottom-6"
      >
        <ChatCircleDots
          aria-hidden
          size={26}
          weight="fill"
          className="transition-transform duration-300 group-hover:-rotate-12"
        />
      </button>

      <ModalSurface
        open={panelOpen}
        onClose={closePanel}
        title={t("title")}
        closeLabel={tCommon("close")}
        variant={desktop ? "popover" : "sheet"}
        className={desktop ? undefined : "h-[88dvh]"}
        bodyClassName="flex min-h-0 flex-1 flex-col"
        headerStart={<LogoMark className="size-9" />}
        headerActions={
          <>
            <IconButton
              label={t("newChat")}
              icon={<Plus aria-hidden size={20} />}
              onClick={() => {
                startNew();
                setDraft("");
              }}
            />
            <IconButton
              label={t("expand")}
              icon={<ArrowsOutSimple aria-hidden size={20} />}
              onClick={expand}
            />
          </>
        }
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
          autoFocus={desktop}
          onDraftChange={setDraft}
          onSend={chat.send}
          onRetry={chat.retry}
          onDismissTooLong={chat.dismissTooLong}
        />
      </ModalSurface>
    </>
  );
}
