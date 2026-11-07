"use client";

import {
  ArrowClockwise,
  ChatCircleDots,
  Info,
  PaperPlaneRight,
  ShieldCheck,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";

import {
  createMessageId,
  issueForError,
  MAX_QUESTION_CHARS,
  parseProductCards,
  readAssistantHistory,
  SseParser,
  toRequestTurns,
  writeAssistantHistory,
  clearOtherAssistantHistories,
  type AssistantIssue,
  type AssistantIssueKind,
  type AssistantMessage,
  type AssistantProductCard,
  type ChatStatus,
} from "./assistant-chat";

export type AssistantWidgetProps = {
  /** The signed-in customer, or null for a visitor. */
  userId: string | null;
};

type NoticeTone = "info" | "warning" | "error";

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

function ProductCards({ cards, locale }: { cards: AssistantProductCard[]; locale: Locale }) {
  const t = useTranslations("assistant");

  return (
    <ul aria-label={t("products")} className="mt-2 grid gap-2">
      {cards.map((card) => (
        <li key={card.sku} className="flex gap-3 rounded-md border border-neutral-200 p-2">
          <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md">
            <ProductImage
              src={card.imageUrl}
              alt={card.name}
              fallbackLabel={t("imageUnavailable")}
              fill
              sizes="56px"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <a
              href={card.url}
              className="rounded-md text-small font-semibold text-navy-900 underline underline-offset-2 hover:no-underline"
            >
              {card.name}
            </a>
            <Price amount={card.priceVnd} locale={locale} size="sm" />
            <Badge tone={card.inStock ? "success" : "soldout"}>
              {card.inStock ? t("cardInStock") : t("cardSoldOut")}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MessageBubble({
  message,
  locale,
  thinking,
}: {
  message: AssistantMessage;
  locale: Locale;
  thinking: string | null;
}) {
  const t = useTranslations("assistant");
  const isUser = message.role === "user";

  return (
    <article aria-label={isUser ? t("you") : t("assistant")}>
      <p className="text-caption font-semibold text-neutral-600">
        {isUser ? t("you") : t("assistant")}
      </p>
      <div
        className={cx(
          "mt-1 rounded-md px-3 py-2 text-small whitespace-pre-wrap text-navy-900",
          isUser ? "bg-neutral-100" : "border-l-2 border-lime-500 bg-neutral-50",
        )}
      >
        {message.content ? (
          message.content
        ) : thinking ? (
          <span className="text-neutral-600">{thinking}</span>
        ) : null}
        {message.interrupted ? (
          <span className="mt-1 block text-caption font-semibold text-warning-700">
            {t("interruptedLabel")}
          </span>
        ) : null}
      </div>
      {message.cards.length > 0 ? <ProductCards cards={message.cards} locale={locale} /> : null}
    </article>
  );
}

/**
 * Fixed shopping-assistant launcher and its panel. The native dialog traps
 * focus and closes on Escape; the panel is a bottom sheet on mobile and a side
 * drawer from `lg` up. Answers stream as plain text, never HTML.
 */
export function AssistantWidget({ userId }: AssistantWidgetProps) {
  const t = useTranslations("assistant");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const desktop = useDesktop();
  const signedIn = userId !== null;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [issue, setIssue] = useState<AssistantIssue | null>(null);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);

  const messagesRef = useRef<AssistantMessage[]>([]);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();

  const blockKind: AssistantIssueKind | null = !signedIn
    ? "unauthenticated"
    : issue?.kind === "not_configured" || status?.configured === false
      ? "not_configured"
      : issue?.kind === "paused" || status?.globalPaused
        ? "paused"
        : issue?.kind === "quota_day" || remaining === 0
          ? "quota_day"
          : issue?.kind === "unauthenticated"
            ? "unauthenticated"
            : null;

  const tooLong: AssistantIssue | null =
    question.length > MAX_QUESTION_CHARS
      ? {
          kind: "too_long",
          retryable: false,
          max: MAX_QUESTION_CHARS,
          count: question.length,
        }
      : null;
  const visibleIssue = blockKind ? null : (tooLong ?? issue);
  const canSend =
    signedIn &&
    !pending &&
    !blockKind &&
    question.trim() !== "" &&
    question.length <= MAX_QUESTION_CHARS;

  function updateMessages(updater: (current: AssistantMessage[]) => AssistantMessage[]) {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }

  function patchMessage(id: string, update: (message: AssistantMessage) => AssistantMessage) {
    updateMessages((current) =>
      current.map((message) => (message.id === id ? update(message) : message)),
    );
  }

  function removeMessage(id: string) {
    updateMessages((current) => current.filter((message) => message.id !== id));
  }

  function persist() {
    if (typeof window === "undefined") {
      return;
    }
    writeAssistantHistory(window.sessionStorage, userId, messagesRef.current);
  }

  function showIssue(
    code: string,
    options: { retryable?: boolean; details?: unknown; count?: number } = {},
  ) {
    setIssue(
      issueForError(code, {
        retryable: options.retryable,
        max: MAX_QUESTION_CHARS,
        count: options.count,
      }),
    );

    if (code === "AI_QUOTA_USER_DAY") {
      setRemaining(0);
    }
    if (code === "AI_QUOTA_GLOBAL") {
      setStatus((current) => (current ? { ...current, globalPaused: true } : current));
    }

    const remainingToday = (options.details as { remainingToday?: unknown } | undefined)
      ?.remainingToday;
    if (typeof remainingToday === "number") {
      setRemaining(remainingToday);
    }
  }

  async function runTurn(content: string, appendUser: boolean) {
    if (busyRef.current || content.trim() === "") {
      return;
    }

    busyRef.current = true;
    setPending(true);
    setIssue(null);
    setFailedQuestion(content);

    if (appendUser) {
      updateMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "user",
          content,
          cards: [],
          interrupted: false,
        },
      ]);
    }
    persist();

    const requestMessages = toRequestTurns(messagesRef.current);
    if (requestMessages.at(-1)?.role !== "user") {
      requestMessages.push({ role: "user", content });
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ locale, messages: requestMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { code?: unknown; details?: unknown };
        } | null;
        const code = typeof payload?.error?.code === "string" ? payload.error.code : "INTERNAL";
        showIssue(code, { details: payload?.error?.details, count: content.length });
        persist();
        return;
      }

      if (!response.body) {
        showIssue("INTERNAL");
        return;
      }

      const assistantId = createMessageId();
      updateMessages((current) => [
        ...current,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          cards: [],
          interrupted: false,
        },
      ]);
      setStreamingId(assistantId);

      const turn = {
        done: false,
        failure: null as { code: string; retryable: boolean } | null,
      };
      const parser = new SseParser((event) => {
        if (event.event === "delta") {
          const text = (event.data as { text?: unknown } | null)?.text;
          if (typeof text === "string" && text !== "") {
            patchMessage(assistantId, (message) => ({
              ...message,
              content: message.content + text,
            }));
          }
        } else if (event.event === "products") {
          const cards = parseProductCards(event.data);
          if (cards.length > 0) {
            patchMessage(assistantId, (message) => ({ ...message, cards }));
          }
        } else if (event.event === "done") {
          turn.done = true;
          const value = (event.data as { remainingToday?: unknown } | null)?.remainingToday;
          if (typeof value === "number") {
            setRemaining(value);
          }
        } else if (event.event === "error") {
          const payload = event.data as { code?: unknown; retryable?: unknown } | null;
          turn.failure = {
            code: typeof payload?.code === "string" ? payload.code : "INTERNAL",
            retryable: payload?.retryable === true,
          };
        }
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.push(decoder.decode());
      parser.end();

      const message = messagesRef.current.find((item) => item.id === assistantId);

      if (turn.failure) {
        const failure = turn.failure;
        if (!message || (message.content === "" && message.cards.length === 0)) {
          removeMessage(assistantId);
        } else {
          patchMessage(assistantId, (item) => ({ ...item, interrupted: true }));
        }
        showIssue(failure.code, { retryable: failure.retryable });
      } else if (!turn.done) {
        if (message && (message.content !== "" || message.cards.length > 0)) {
          patchMessage(assistantId, (item) => ({ ...item, interrupted: true }));
        } else {
          removeMessage(assistantId);
        }
        showIssue("AI_STREAM_INTERRUPTED", { retryable: true });
      } else {
        setIssue(null);
      }
      persist();
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") {
        return;
      }

      const last = messagesRef.current.at(-1);
      if (last?.role === "assistant") {
        if (last.content !== "" || last.cards.length > 0) {
          patchMessage(last.id, (item) => ({ ...item, interrupted: true }));
          showIssue("AI_STREAM_INTERRUPTED", { retryable: true });
        } else {
          removeMessage(last.id);
          showIssue("AI_UNAVAILABLE", { retryable: true });
        }
      } else {
        showIssue("AI_UNAVAILABLE", { retryable: true });
      }
      persist();
    } finally {
      abortRef.current = null;
      busyRef.current = false;
      setPending(false);
      setStreamingId(null);
    }
  }

  function submitQuestion() {
    const content = question.trim();
    if (!content || busyRef.current || blockKind) {
      return;
    }
    if (content.length > MAX_QUESTION_CHARS) {
      setIssue({
        kind: "too_long",
        retryable: false,
        max: MAX_QUESTION_CHARS,
        count: content.length,
      });
      return;
    }
    setQuestion("");
    void runTurn(content, true);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitQuestion();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) {
        submitQuestion();
      }
    }
  }

  function retryLast() {
    if (busyRef.current) {
      return;
    }
    const lastUser = [...messagesRef.current].reverse().find((message) => message.role === "user");
    const content = failedQuestion ?? lastUser?.content;
    if (!content) {
      return;
    }
    const last = messagesRef.current.at(-1);
    void runTurn(content, last?.role !== "user");
  }

  // Load the transcript for this account and drop another account's history.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    clearOtherAssistantHistories(window.sessionStorage, userId);
    const stored = readAssistantHistory(window.sessionStorage, userId);
    const loaded = stored.map((turn) => ({
      id: createMessageId(),
      role: turn.role,
      content: turn.content,
      cards: [],
      interrupted: false,
    }));
    messagesRef.current = loaded;
    // Session storage is an external store; the transcript is read once per
    // mounted account, so this is not a render-derived state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loaded);
  }, [userId]);

  // Ask for the quota and configuration whenever the panel opens.
  useEffect(() => {
    if (!open || !signedIn) {
      return;
    }
    let active = true;

    fetch("/api/chat/status", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("status");
        }
        return (await response.json()) as ChatStatus;
      })
      .then((data) => {
        if (!active) {
          return;
        }
        setStatus(data);
        setRemaining(typeof data.remainingToday === "number" ? data.remainingToday : null);
        if (data.signedIn === false) {
          setIssue(issueForError("UNAUTHENTICATED"));
        } else if (!data.configured) {
          setIssue(issueForError("AI_NOT_CONFIGURED"));
        }
      })
      .catch(() => {
        // Keep the composer usable; the chat request reports its own error.
      });

    return () => {
      active = false;
    };
  }, [open, signedIn]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (pathname === "/sign-in" || pathname === "/sign-up") {
    return null;
  }

  const search = typeof window === "undefined" ? "" : window.location.search;
  const signInHref = `/sign-in?next=${encodeURIComponent(`${pathname}${search}`)}`;
  const notice =
    visibleIssue && !blockKind
      ? { kind: visibleIssue.kind, issue: visibleIssue }
      : blockKind
        ? {
            kind: blockKind,
            issue: issue?.kind === blockKind ? issue : undefined,
          }
        : null;

  function noticeCopy(kind: AssistantIssueKind, current?: AssistantIssue) {
    switch (kind) {
      case "not_configured":
        return {
          title: t("notConfiguredTitle"),
          body: t("notConfiguredBody"),
          tone: "info" as NoticeTone,
        };
      case "quota_day":
        return {
          title: t("quotaDayTitle"),
          body: t("quotaDayBody"),
          tone: "warning" as NoticeTone,
        };
      case "quota_minute":
        return {
          title: t("quotaMinuteTitle"),
          body: t("quotaMinuteBody"),
          tone: "warning" as NoticeTone,
        };
      case "paused":
        return { title: t("pausedTitle"), body: t("pausedBody"), tone: "warning" as NoticeTone };
      case "unauthenticated":
        return { title: t("signInTitle"), body: t("signInBody"), tone: "info" as NoticeTone };
      case "too_long":
        return {
          title: t("tooLongTitle"),
          body: t("tooLongBody", { max: current?.max ?? MAX_QUESTION_CHARS }),
          tone: "warning" as NoticeTone,
        };
      case "interrupted":
        return {
          title: t("interruptedTitle"),
          body: t("interruptedBody"),
          tone: "warning" as NoticeTone,
        };
      case "error":
      default:
        return { title: t("errorTitle"), body: t("errorBody"), tone: "error" as NoticeTone };
    }
  }

  function renderNotice(kind: AssistantIssueKind, current?: AssistantIssue): ReactNode {
    const copy = noticeCopy(kind, current);
    const toneClasses: Record<NoticeTone, string> = {
      info: "border-neutral-200 bg-neutral-50 text-navy-900",
      warning: "border-warning-200 bg-warning-50 text-warning-700",
      error: "border-error-200 bg-error-50 text-error-700",
    };
    const icons: Record<NoticeTone, ReactNode> = {
      info: <Info aria-hidden size={20} />,
      warning: <Warning aria-hidden size={20} />,
      error: <WarningCircle aria-hidden size={20} />,
    };
    const showRetry = current?.retryable === true && (kind === "error" || kind === "interrupted");
    const showSignIn = kind === "unauthenticated";

    return (
      <div
        role={copy.tone === "error" ? "alert" : "status"}
        className={cx(
          "flex items-start gap-3 rounded-md border p-3 text-small",
          toneClasses[copy.tone],
        )}
      >
        <span className="mt-px shrink-0">{icons[copy.tone]}</span>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-semibold">{copy.title}</p>
          <p>{copy.body}</p>
          {showSignIn ? (
            <Link href={signInHref} className={buttonClasses({ size: "sm" })}>
              {t("signInAction")}
            </Link>
          ) : null}
          {showRetry ? (
            <Button variant="secondary" size="sm" onClick={retryLast} disabled={pending}>
              <ArrowClockwise aria-hidden size={18} />
              {t("retry")}
            </Button>
          ) : null}
        </div>
      </div>
    );
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
        onClose={() => setOpen(false)}
        title={t("title")}
        closeLabel={tCommon("close")}
        variant={desktop ? "drawer-right" : "sheet"}
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="flex flex-col gap-3">
            <p className="text-small text-neutral-600">{t("intro")}</p>
            <div className="flex items-start gap-2 rounded-md bg-neutral-50 p-3 text-small text-neutral-600">
              <ShieldCheck aria-hidden size={20} className="mt-px shrink-0 text-navy-900" />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-navy-900">{t("privacyTitle")}</p>
                <p>{t("privacyBody")}</p>
              </div>
            </div>
            {remaining !== null && remaining > 0 && !blockKind ? (
              <Badge tone="accent">{t("remaining", { count: remaining })}</Badge>
            ) : null}
          </div>

          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-busy={pending}
            aria-label={t("transcript")}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          >
            {messages.length === 0 ? (
              <p className="rounded-md border border-dashed border-neutral-300 p-4 text-small text-neutral-600">
                {t("empty")}
              </p>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  locale={locale}
                  thinking={
                    pending && streamingId === message.id && message.content === ""
                      ? t("thinking")
                      : null
                  }
                />
              ))
            )}
          </div>

          {notice ? renderNotice(notice.kind, notice.issue) : null}

          {blockKind ? null : (
            <form onSubmit={onSubmit} className="flex flex-col gap-2">
              <label htmlFor={inputId} className="text-small font-medium text-navy-900">
                {t("inputLabel")}
              </label>
              <textarea
                ref={textareaRef}
                id={inputId}
                rows={2}
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  if (issue?.kind === "too_long") {
                    setIssue(null);
                  }
                }}
                onKeyDown={onComposerKeyDown}
                placeholder={t("placeholder")}
                aria-invalid={tooLong ? true : undefined}
                aria-describedby={tooLong ? `${inputId}-too-long` : undefined}
                className={cx(
                  "w-full resize-none rounded-md border bg-white px-3 py-2 text-body text-navy-900 transition-colors duration-150",
                  tooLong ? "border-error-700" : "border-neutral-500 hover:border-navy-900",
                )}
              />
              {tooLong ? (
                <p id={`${inputId}-too-long`} className="text-small text-error-700">
                  {t("tooLongCount", {
                    count: question.length,
                    max: MAX_QUESTION_CHARS,
                  })}
                </p>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <p className="text-caption text-neutral-600">
                  {t("composerHint", { max: MAX_QUESTION_CHARS })}
                </p>
                <Button type="submit" size="sm" disabled={!canSend}>
                  <PaperPlaneRight aria-hidden size={18} />
                  {pending ? t("sending") : t("send")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </ModalSurface>
    </>
  );
}
