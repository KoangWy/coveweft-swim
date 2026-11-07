"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Locale } from "@/lib/locale";

import {
  clearOtherAssistantHistories,
  createMessageId,
  issueForError,
  MAX_QUESTION_CHARS,
  parseProductCards,
  readAssistantHistory,
  reconcileIssueWithStatus,
  SseParser,
  toRequestTurns,
  writeAssistantHistory,
  type AssistantIssue,
  type AssistantIssueKind,
  type AssistantMessage,
  type ChatStatus,
} from "./assistant-chat";

export type UseAssistantChatOptions = {
  userId: string | null;
  locale: Locale;
  /** Fetch status while the panel is open. */
  open: boolean;
};

export type AssistantChat = {
  messages: AssistantMessage[];
  pending: boolean;
  streamingId: string | null;
  issue: AssistantIssue | null;
  /** A blocking state replaces the composer. */
  blockKind: AssistantIssueKind | null;
  remaining: number | null;
  send: (content: string) => void;
  retry: () => void;
  /** Aborts the active turn and settles any partial answer. */
  abort: () => void;
  dismissTooLong: () => void;
};

type ActiveTurn = {
  requestId: number;
  assistantId: string | null;
  done: boolean;
};

/**
 * Owns one browser chat session: transport, SSE parsing, aborting, quota
 * reconciliation, retry, and session-storage persistence. Closing the panel
 * aborts the active turn; a stale request can never change a newer turn's
 * state because every run carries a monotonic request id.
 */
export function useAssistantChat({ userId, locale, open }: UseAssistantChatOptions): AssistantChat {
  const signedIn = userId !== null;

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [issue, setIssue] = useState<AssistantIssue | null>(null);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [failedQuestion, setFailedQuestion] = useState<string | null>(null);

  const messagesRef = useRef<AssistantMessage[]>([]);
  const remainingRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const activeTurnRef = useRef<ActiveTurn | null>(null);
  const requestIdRef = useRef(0);
  const quotaVersionRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const updateMessages = (updater: (current: AssistantMessage[]) => AssistantMessage[]) => {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  };

  const patchMessage = (id: string, update: (message: AssistantMessage) => AssistantMessage) => {
    updateMessages((current) =>
      current.map((message) => (message.id === id ? update(message) : message)),
    );
  };

  const removeMessage = (id: string) => {
    updateMessages((current) => current.filter((message) => message.id !== id));
  };

  const persist = () => {
    if (typeof window === "undefined") {
      return;
    }
    writeAssistantHistory(window.sessionStorage, userId, messagesRef.current);
  };

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

      if (!response.ok) {
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
    persist();

    const requestMessages = toRequestTurns(messagesRef.current);
    if (requestMessages.at(-1)?.role !== "user") {
      requestMessages.push({ role: "user", content });
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

      // The server consumes one question before it starts the SSE response,
      // including turns that later fail. Reflect that immediately; `done` or
      // a fresh status response replaces the estimate with the exact count.
      accepted = true;
      if (typeof remainingRef.current === "number" && remainingRef.current > 0) {
        setRemainingValue(remainingRef.current - 1);
      }

      if (!response.body) {
        showIssue("INTERNAL");
        persist();
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
        if (requestIdRef.current !== requestId) {
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
          const value = (event.data as { remainingToday?: unknown } | null)?.remainingToday;
          if (typeof value === "number") {
            setRemainingValue(value);
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

      if (requestIdRef.current !== requestId) {
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
      persist();

      if (acceptedFailure) {
        void refreshStatus();
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
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

      if (accepted) {
        void refreshStatus();
      }
    } finally {
      if (requestIdRef.current === requestId) {
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
    // touch state that belongs to a newer turn opened after this close.
    requestIdRef.current += 1;
    abortRef.current = null;
    activeTurnRef.current = null;
    busyRef.current = false;
    setPending(false);
    setStreamingId(null);

    if (active && !active.done && active.assistantId) {
      const message = messagesRef.current.find((item) => item.id === active.assistantId);
      if (message && (message.content !== "" || message.cards.length > 0)) {
        patchMessage(active.assistantId, (item) => ({ ...item, interrupted: true }));
      } else {
        removeMessage(active.assistantId);
      }
      persist();
    }

    controller?.abort();
  }

  function dismissTooLong() {
    setIssue((current) => (current?.kind === "too_long" ? null : current));
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
      interrupted: turn.interrupted === true,
    }));
    messagesRef.current = loaded;
    // Session storage is an external store; the transcript is read once per
    // mounted account, so this is not a render-derived state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loaded);
  }, [userId]);

  // Ask for the quota and configuration whenever the panel opens.
  useEffect(() => {
    if (open && signedIn) {
      // The status endpoint is an external system; its response updates quota
      // and configuration state rather than deriving them from props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void refreshStatus();
    }
  }, [open, signedIn, refreshStatus]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  return {
    messages,
    pending,
    streamingId,
    issue,
    blockKind,
    remaining,
    send,
    retry,
    abort,
    dismissTooLong,
  };
}
