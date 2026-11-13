"use client";

import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/lib/locale";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearLegacyAssistantHistories,
  createMessageId,
  isAbortError,
  issueBlocksComposer,
  issueForError,
  MAX_QUESTION_CHARS,
  parseProductCards,
  reconcileIssueWithStatus,
  SseParser,
  type AssistantIssue,
  type AssistantIssueKind,
  type AssistantMessage,
  type ChatStatus,
} from "./assistant-chat";

export type UseAssistantChatOptions = {
  userId: string | null;
  locale: Locale;
};

export type AssistantChat = {
  conversationId: string | null;
  messages: AssistantMessage[];
  pending: boolean;
  streamingId: string | null;
  issue: AssistantIssue | null;
  /** A blocking state replaces the composer. */
  blockKind: AssistantIssueKind | null;
  remaining: number | null;
  send: (content: string) => void;
  retry: () => void;
  /** Aborts the active turn, keeping the partial answer marked incomplete. */
  abort: () => void;
  /** Aborts the active turn and starts an empty conversation. */
  startNew: () => void;
  /** Shows a conversation loaded by the server, unless it is already live. */
  openConversation: (id: string, messages: AssistantMessage[]) => void;
  /** True while a turn is streaming; read from event handlers. */
  isBusy: () => boolean;
  /** Loads quota and configuration ahead of opening a screen. */
  prefetchStatus: () => void;
  /** Makes the next open fetch a fresh status instead of reusing a prefetch. */
  forgetStatus: () => void;
  dismissTooLong: () => void;
};

/** How long a status response counts as current. */
const STATUS_FRESH_MS = 30_000;

type ActiveTurn = {
  requestId: number;
  assistantId: string | null;
  done: boolean;
};

/**
 * Owns the conversation that the panel and the Assistant page share:
 * transport, SSE parsing, aborting, quota reconciliation, retry, and the
 * current conversation id. The database is the source of truth, so nothing is
 * written to browser storage. A stale request can never change a newer turn's
 * state because every run carries a monotonic request id.
 */
export function useAssistantChat({ userId, locale }: UseAssistantChatOptions): AssistantChat {
  const signedIn = userId !== null;
  const router = useRouter();

  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [issue, setIssue] = useState<AssistantIssue | null>(null);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);

  const conversationIdRef = useRef<string | null>(null);
  const messagesRef = useRef<AssistantMessage[]>([]);
  const remainingRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const requestIdRef = useRef(0);
  const quotaVersionRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const statusFetchedAtRef = useRef(0);
  const previousUserRef = useRef(userId);

  const updateMessages = (updater: (current: AssistantMessage[]) => AssistantMessage[]) => {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  };

  const setConversationId = (value: string | null) => {
    conversationIdRef.current = value;
    setConversationIdState(value);
  };

  const patchMessage = (id: string, update: (message: AssistantMessage) => AssistantMessage) => {
    updateMessages((current) =>
      current.map((message) => (message.id === id ? update(message) : message)),
    );
  };

  const removeMessage = (id: string) => {
    updateMessages((current) => current.filter((message) => message.id !== id));
  };

  function isCurrentRequest(requestId: number, controller: AbortController): boolean {
    return mountedRef.current && requestIdRef.current === requestId && !controller.signal.aborted;
  }

  const setRemainingValue = useCallback((value: number | null) => {
    quotaVersionRef.current += 1;
    remainingRef.current = value;
    setRemaining(value);
  }, []);

  const refreshStatus = useCallback(async () => {
    const requestId = ++statusRequestIdRef.current;
    const quotaVersion = quotaVersionRef.current;

    try {
      const response = await fetch("/api/chat/status", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok || !mountedRef.current || requestId !== statusRequestIdRef.current) {
        return;
      }

      const data = (await response.json()) as ChatStatus;

      // Ignore a response that started before a newer turn changed quota, and
      // ignore any response superseded by a newer status request.
      if (
        !mountedRef.current ||
        requestId !== statusRequestIdRef.current ||
        quotaVersion !== quotaVersionRef.current
      ) {
        return;
      }

      setStatus(data);
      setRemainingValue(typeof data.remainingToday === "number" ? data.remainingToday : null);
      setIssue((current) => reconcileIssueWithStatus(current, data));
    } catch {
      // Keep the last known state; the chat request reports its own error.
    }
  }, [setRemainingValue]);

  const showIssue = (
    code: string,
    options: { retryable?: boolean; details?: unknown; count?: number } = {},
  ) => {
    setIssue(
      issueForError(code, {
        retryable: options.retryable,
        max: MAX_QUESTION_CHARS,
        count: options.count,
      }),
    );

    if (code === "AI_QUOTA_USER_DAY") {
      setRemainingValue(0);
    } else {
      const remainingToday = (options.details as { remainingToday?: unknown } | undefined)
        ?.remainingToday;
      if (typeof remainingToday === "number") {
        setRemainingValue(remainingToday);
      }
    }

    if (code === "AI_QUOTA_GLOBAL") {
      setStatus((current) => (current ? { ...current, globalPaused: true } : current));
    }
  };

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

  function settleInterrupted(messageId: string | null) {
    if (!messageId) {
      return;
    }

    const message = messagesRef.current.find((item) => item.id === messageId);

    if (message && (message.content !== "" || message.cards.length > 0)) {
      patchMessage(messageId, (item) => ({ ...item, interrupted: true }));
    } else {
      removeMessage(messageId);
    }
  }

  /**
   * Adopts the id the server assigned before any answer text. On the Assistant
   * page this replaces `/assistant` with the conversation URL without
   * remounting the shared state, so the running answer is not interrupted.
   */
  function adoptConversation(id: string) {
    if (conversationIdRef.current !== id) {
      setConversationId(id);
    }

    if (typeof window !== "undefined" && window.location.pathname === `/${locale}/assistant`) {
      router.replace(`/assistant/${id}`);
    }
  }

  async function runTurn(content: string, appendUser: boolean) {
    if (busyRef.current || content.trim() === "") {
      return;
    }

    const requestId = ++requestIdRef.current;
    busyRef.current = true;
    activeTurnRef.current = { requestId, assistantId: null, done: false };
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

    const controller = new AbortController();
    abortRef.current = controller;
    let accepted = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          locale,
          conversationId: conversationIdRef.current,
          message: content,
        }),
        signal: controller.signal,
      });

      if (!isCurrentRequest(requestId, controller)) {
        return;
      }

      if (!response.ok) {
        let payload: unknown = null;

        try {
          payload = await response.json();
        } catch (error) {
          // A body read that was cancelled by close/unmount is not a malformed
          // response; the request is already invalid and must not touch state.
          if (isAbortError(error) || !isCurrentRequest(requestId, controller)) {
            return;
          }
        }

        if (!isCurrentRequest(requestId, controller)) {
          return;
        }

        const error = (payload as { error?: { code?: unknown; details?: unknown } } | null)?.error;
        const code = typeof error?.code === "string" ? error.code : "INTERNAL";
        showIssue(code, { details: error?.details, count: content.length });
        return;
      }

      const responseConversationId = response.headers.get("X-Conversation-Id");

      if (responseConversationId) {
        adoptConversation(responseConversationId);
      }

      // The server consumes one question before it starts the SSE response,
      // including turns that later fail. Reflect that immediately; `done` or
      // a fresh status response replaces the estimate with the exact count.
      accepted = true;
      if (typeof remainingRef.current === "number" && remainingRef.current > 0) {
        setRemainingValue(remainingRef.current - 1);
      }

      if (!response.body) {
        showIssue("INTERNAL");
        void refreshStatus();
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
      activeTurnRef.current = { requestId, assistantId, done: false };
      setStreamingId(assistantId);

      const turn = {
        done: false,
        failure: null as { code: string; retryable: boolean } | null,
      };
      const parser = new SseParser((event) => {
        if (!mountedRef.current || requestIdRef.current !== requestId) {
          return;
        }

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
          if (activeTurnRef.current?.requestId === requestId) {
            activeTurnRef.current = { requestId, assistantId, done: true };
          }
          const data = event.data as { remainingToday?: unknown; conversationId?: unknown } | null;
          if (typeof data?.remainingToday === "number") {
            setRemainingValue(data.remainingToday);
          }
          if (typeof data?.conversationId === "string") {
            adoptConversation(data.conversationId);
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

      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }

      const message = messagesRef.current.find((item) => item.id === assistantId);
      let acceptedFailure = false;

      if (turn.failure) {
        const failure = turn.failure;
        if (!message || (message.content === "" && message.cards.length === 0)) {
          removeMessage(assistantId);
        } else {
          patchMessage(assistantId, (item) => ({ ...item, interrupted: true }));
        }
        showIssue(failure.code, { retryable: failure.retryable });
        acceptedFailure = true;
      } else if (!turn.done) {
        if (message && (message.content !== "" || message.cards.length > 0)) {
          patchMessage(assistantId, (item) => ({ ...item, interrupted: true }));
        } else {
          removeMessage(assistantId);
        }
        showIssue("AI_STREAM_INTERRUPTED", { retryable: true });
        acceptedFailure = true;
      } else {
        setIssue(null);
      }

      if (acceptedFailure) {
        void refreshStatus();
      }
    } catch (error) {
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }
      if (isAbortError(error)) {
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

      if (accepted) {
        void refreshStatus();
      }
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        abortRef.current = null;
        activeTurnRef.current = null;
        busyRef.current = false;
        setPending(false);
        setStreamingId(null);
      }
    }
  }

  function send(content: string) {
    const trimmed = content.trim();
    if (!trimmed || busyRef.current || blockKind) {
      return;
    }
    if (trimmed.length > MAX_QUESTION_CHARS) {
      setIssue({
        kind: "too_long",
        retryable: false,
        max: MAX_QUESTION_CHARS,
        count: trimmed.length,
      });
      return;
    }
    void runTurn(trimmed, true);
  }

  function retry() {
    if (busyRef.current || blockKind) {
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

  function abort() {
    const active = activeTurnRef.current;
    const controller = abortRef.current;

    // Invalidate the running turn before settling, so its finalizer cannot
    // touch state that belongs to a newer turn.
    requestIdRef.current += 1;
    abortRef.current = null;
    activeTurnRef.current = null;
    busyRef.current = false;
    setPending(false);
    setStreamingId(null);

    settleInterrupted(active && !active.done ? active.assistantId : null);
    controller?.abort();
  }

  function startNew() {
    abort();
    setConversationId(null);
    updateMessages(() => []);
    setIssue((current) => (current && issueBlocksComposer(current.kind) ? current : null));
    setFailedQuestion(null);
  }

  function openConversation(id: string, loaded: AssistantMessage[]) {
    // Expand and the URL change that follows it must not replace the answer
    // that is still streaming in this same conversation.
    if (conversationIdRef.current === id) {
      return;
    }

    abort();
    setConversationId(id);
    messagesRef.current = loaded;
    setMessages(loaded);
    setIssue(null);
    setFailedQuestion(null);
  }

  const prefetchStatus = useCallback(() => {
    if (signedIn && Date.now() - statusFetchedAtRef.current > STATUS_FRESH_MS) {
      statusFetchedAtRef.current = Date.now();
      void refreshStatus();
    }
  }, [signedIn, refreshStatus]);

  function forgetStatus() {
    statusFetchedAtRef.current = 0;
  }

  function dismissTooLong() {
    setIssue((current) => (current?.kind === "too_long" ? null : current));
  }

  // Drop transcripts from the browser-only history of earlier versions.
  useEffect(() => {
    if (typeof window !== "undefined") {
      clearLegacyAssistantHistories(window.sessionStorage);
    }
  }, []);

  // A different account must never inherit the previous customer's messages.
  // The first null -> customer change is the session resolving; a page may
  // already have opened a saved conversation at that point, so keep it.
  useEffect(() => {
    if (previousUserRef.current === userId) {
      return;
    }

    const signedOut = previousUserRef.current !== null;
    previousUserRef.current = userId;

    if (!signedOut) {
      return;
    }

    abort();
    setConversationId(null);
    updateMessages(() => []);
    setFailedQuestion(null);
    setStatus(null);
    statusFetchedAtRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  return {
    conversationId,
    messages,
    pending,
    streamingId,
    issue,
    blockKind,
    remaining,
    send,
    retry,
    abort,
    startNew,
    openConversation,
    isBusy: () => busyRef.current,
    prefetchStatus,
    forgetStatus,
    dismissTooLong,
  };
}
