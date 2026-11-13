"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { Link, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import type { ErrorCode } from "@/server/errors";

import {
  deleteAllConversationsAction,
  deleteConversationAction,
  loadConversationsAction,
} from "../actions";
import { type AssistantConversation, type AssistantMessage } from "./assistant-chat";
import { AssistantPanel } from "./assistant-panel";
import { useAssistant } from "./assistant-provider";

export type AssistantPageProps = {
  userId: string | null;
  conversationId: string | null;
  initialMessages: AssistantMessage[];
  initialConversations: AssistantConversation[];
  initialNextCursor: string | null;
  /** The signed-in customer agreed to an earlier privacy policy version. */
  policyNotice: boolean;
};

function ConversationRail({
  conversations,
  activeId,
  nextCursor,
  loadingMore,
  pending,
  showHeading = true,
  onOpen,
  onLoadMore,
  onNewChat,
  onDelete,
  onDeleteAll,
}: {
  conversations: AssistantConversation[];
  activeId: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  pending: boolean;
  showHeading?: boolean;
  onOpen: (id: string) => void;
  onLoadMore: () => void;
  onNewChat: () => void;
  onDelete: (conversation: AssistantConversation) => void;
  onDeleteAll: () => void;
}) {
  const t = useTranslations("assistant");
  const format = useFormatter();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className={`flex items-center gap-2 ${showHeading ? "justify-between" : "justify-end"}`}>
        {showHeading ? (
          <h2 className="text-heading-sm font-semibold text-navy-900">{t("conversations")}</h2>
        ) : null}
        <div className="flex items-center">
          <IconButton
            label={t("newChat")}
            icon={<Plus aria-hidden size={20} />}
            onClick={onNewChat}
          />
          <IconButton
            label={t("deleteAll")}
            icon={<Trash aria-hidden size={19} />}
            onClick={onDeleteAll}
            disabled={pending || conversations.length === 0}
          />
        </div>
      </div>

      {conversations.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 px-3 py-4 text-small text-neutral-600">
          {t("noConversations")}
        </p>
      ) : (
        <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-1">
          {conversations.map((conversation) => {
            const active = conversation.id === activeId;

            return (
              <li key={conversation.id} className="group relative">
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpen(conversation.id)}
                  className={`flex w-full flex-col gap-0.5 rounded-md px-3 py-2.5 pr-10 text-left transition-colors duration-150 ${
                    active ? "bg-navy-900 text-white" : "text-navy-900 hover:bg-neutral-100"
                  }`}
                >
                  <span className="line-clamp-2 text-small font-medium">{conversation.title}</span>
                  <span
                    className={`text-caption ${active ? "text-neutral-300" : "text-neutral-600"}`}
                  >
                    {format.dateTime(new Date(conversation.updatedAt), { dateStyle: "medium" })}
                  </span>
                </button>
                <span className="absolute top-2 right-1">
                  <IconButton
                    size="sm"
                    label={t("delete")}
                    icon={<Trash aria-hidden size={16} />}
                    onClick={() => onDelete(conversation)}
                    disabled={pending}
                    className={
                      active
                        ? "text-white hover:bg-navy-800"
                        : "text-neutral-600 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    }
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? t("loading") : t("seeMore")}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Assistant page: conversation rail plus the shared transcript and composer.
 * It reads the same provider as the floating panel, so expanding a running
 * answer keeps the stream and closing the panel keeps it running.
 */
export function AssistantPage({
  userId,
  conversationId,
  initialMessages,
  initialConversations,
  initialNextCursor,
  policyNotice,
}: AssistantPageProps) {
  const t = useTranslations("assistant");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const assistant = useAssistant();
  const { setSession, setDraft, draft, startNew, openConversation, isBusy, prefetchStatus } =
    assistant;
  const [conversations, setConversations] = useState(initialConversations);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssistantConversation | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [actionError, setActionError] = useState<ErrorCode | null>(null);
  const [loadingMore, startLoadingMore] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const syncedRef = useRef<string | null>(null);
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const routeKey = conversationId ?? "new";

  useEffect(() => {
    setSession(userId);
  }, [setSession, userId]);

  useEffect(() => {
    prefetchStatus();
  }, [prefetchStatus]);

  // Adopt the conversation of the URL once per route change. A route that is
  // already live, for example after Expand during a stream, is left alone.
  useEffect(() => {
    if (syncedRef.current === routeKey) {
      return;
    }
    syncedRef.current = routeKey;

    if (conversationId) {
      openConversation(conversationId, initialMessages);
    } else if (!isBusy()) {
      startNew();
    }

    setSyncKey(routeKey);
    // The loaded messages belong to the route key; re-running on every render
    // would replace a stream that started after the route changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // A new conversation is adopted before the next server render; refresh the
  // first page once so the rail shows it without a full navigation.
  const refreshedForRef = useRef<string | null>(null);
  useEffect(() => {
    const id = assistant.conversationId;

    if (!id || refreshedForRef.current === id) {
      return;
    }

    refreshedForRef.current = id;

    if (conversations.some((conversation) => conversation.id === id)) {
      return;
    }

    let cancelled = false;
    void loadConversationsAction(null).then((result) => {
      if (!cancelled && result.ok) {
        setConversations(result.data.items);
        setNextCursor(result.data.nextCursor);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [assistant.conversationId, conversations]);

  const live =
    assistant.conversationId !== null &&
    (conversationId === null ? syncKey === routeKey : assistant.conversationId === conversationId);
  const messages = live ? assistant.messages : initialMessages;
  const pending = live ? assistant.pending : false;
  const blockKind = userId === null ? "unauthenticated" : assistant.blockKind;
  const activeRailId = live ? assistant.conversationId : conversationId;
  const currentPath = conversationId ? `/assistant/${conversationId}` : "/assistant";
  const signInHref = `/sign-in?next=${encodeURIComponent(currentPath)}`;

  function newChat() {
    startNew();
    setDraft("");
    setActionError(null);
    setDrawerOpen(false);
    if (conversationId) {
      router.push("/assistant");
    }
  }

  function open(id: string) {
    setDrawerOpen(false);
    if (id !== conversationId) {
      router.push(`/assistant/${id}`);
    }
  }

  function loadMore() {
    if (!nextCursor) {
      return;
    }

    startLoadingMore(async () => {
      const result = await loadConversationsAction(nextCursor);

      if (result.ok) {
        setConversations((current) => [...current, ...result.data.items]);
        setNextCursor(result.data.nextCursor);
      } else {
        setActionError(result.error.code);
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setActionError(null);
    const target = deleteTarget;
    startDeleting(async () => {
      const result = await deleteConversationAction(target.id);

      if (!result.ok) {
        setActionError(result.error.code);
        return;
      }

      setConversations((current) => current.filter((item) => item.id !== target.id));
      setDeleteTarget(null);

      if (conversationId === target.id || assistant.conversationId === target.id) {
        startNew();
        setDraft("");
        router.replace("/assistant");
      }
    });
  }

  function confirmDeleteAll() {
    setActionError(null);
    startDeleting(async () => {
      const result = await deleteAllConversationsAction();

      if (!result.ok) {
        setActionError(result.error.code);
        return;
      }

      setConversations([]);
      setNextCursor(null);
      setDeleteAllOpen(false);
      startNew();
      setDraft("");
      router.replace("/assistant");
    });
  }

  const rail = (
    <ConversationRail
      conversations={conversations}
      activeId={activeRailId}
      nextCursor={nextCursor}
      loadingMore={loadingMore}
      pending={pending}
      onOpen={open}
      onLoadMore={loadMore}
      onNewChat={newChat}
      onDelete={(conversation) => {
        setActionError(null);
        setDeleteTarget(conversation);
      }}
      onDeleteAll={() => {
        setActionError(null);
        setDeleteAllOpen(true);
      }}
    />
  );

  return (
    <Container className="flex h-[calc(100dvh-10.5rem)] min-h-0 flex-col py-6 lg:h-[calc(100dvh-10.75rem)] lg:py-8 xl:h-[calc(100dvh-7rem)]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-title font-display text-navy-900">{t("pageTitle")}</h1>
          <p className="max-w-[62ch] text-small text-neutral-700">{t("pageIntro")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            disabled={userId === null}
          >
            {t("conversations")}
          </Button>
          <Button onClick={newChat} disabled={userId === null}>
            <Plus aria-hidden size={18} />
            {t("newChat")}
          </Button>
        </div>
      </div>

      {userId !== null ? (
        <div className="mt-4 flex flex-col gap-1.5">
          <p className="text-caption text-neutral-600">{t("savedNotice")}</p>
          {policyNotice ? (
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-small text-navy-900">
              {t("policyUpdate")}{" "}
              <Link href="/policies/privacy" className="font-semibold underline">
                {t("privacyLink")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid min-h-0 flex-1 gap-6 lg:mt-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {userId !== null ? <aside className="hidden min-h-0 flex-col lg:flex">{rail}</aside> : null}

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <AssistantPanel
            messages={messages}
            pending={pending}
            streamingId={live ? assistant.streamingId : null}
            issue={assistant.issue}
            blockKind={blockKind}
            remaining={assistant.remaining}
            locale={locale}
            signInHref={signInHref}
            draft={draft}
            autoFocus={false}
            onDraftChange={setDraft}
            onSend={assistant.send}
            onRetry={assistant.retry}
            onDismissTooLong={assistant.dismissTooLong}
          />
        </section>
      </div>

      <Drawer
        open={drawerOpen && userId !== null}
        onClose={() => setDrawerOpen(false)}
        title={t("conversations")}
        closeLabel={tCommon("close")}
        side="right"
      >
        <div className="flex h-full min-h-0 flex-col">
          <ConversationRail
            conversations={conversations}
            activeId={activeRailId}
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            pending={pending}
            showHeading={false}
            onOpen={open}
            onLoadMore={loadMore}
            onNewChat={newChat}
            onDelete={(conversation) => {
              setActionError(null);
              setDeleteTarget(conversation);
            }}
            onDeleteAll={() => {
              setActionError(null);
              setDeleteAllOpen(true);
            }}
          />
        </div>
      </Drawer>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t("deleteTitle")}
        closeLabel={tCommon("close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t("cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("deleteConfirm")}
            </Button>
          </>
        }
      >
        <p className="text-body text-neutral-700">{t("deleteBody")}</p>
        {deleteTarget ? (
          <p className="mt-2 text-small font-medium text-navy-900">{deleteTarget.title}</p>
        ) : null}
        {actionError ? (
          <p role="alert" className="mt-4 text-small text-error-700">
            {tErrors(actionError)}
          </p>
        ) : null}
      </Dialog>

      <Dialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        title={t("deleteAllTitle")}
        closeLabel={tCommon("close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteAllOpen(false)} disabled={deleting}>
              {t("cancel")}
            </Button>
            <Button variant="danger" onClick={confirmDeleteAll} disabled={deleting}>
              {deleting ? t("deleting") : t("deleteAllConfirm")}
            </Button>
          </>
        }
      >
        <p className="text-body text-neutral-700">{t("deleteAllBody")}</p>
        {actionError ? (
          <p role="alert" className="mt-4 text-small text-error-700">
            {tErrors(actionError)}
          </p>
        ) : null}
      </Dialog>
    </Container>
  );
}
