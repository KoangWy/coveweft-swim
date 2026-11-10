"use client";

import { ShieldCheck, Sparkle, Warning } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { LogoMark } from "@/components/layout/logo-mark";
import type { Locale } from "@/lib/locale";

import {
  LOW_QUOTA_THRESHOLD,
  MAX_QUESTION_CHARS,
  type AssistantIssue,
  type AssistantIssueKind,
  type AssistantMessage,
} from "./assistant-chat";
import { AssistantComposer } from "./assistant-composer";
import { AssistantMessageView } from "./assistant-message";
import { AssistantNotice } from "./assistant-notice";

/** Distance from the bottom, in pixels, within which new text keeps the log pinned. */
const STICK_DISTANCE = 80;

const SUGGESTIONS = ["laps", "size", "kids"] as const;

export type AssistantPanelProps = {
  messages: AssistantMessage[];
  pending: boolean;
  streamingId: string | null;
  issue: AssistantIssue | null;
  blockKind: AssistantIssueKind | null;
  remaining: number | null;
  locale: Locale;
  signInHref: string;
  draft: string;
  /** Focus the question field when the panel opens (desktop only). */
  autoFocus?: boolean;
  onDraftChange: (value: string) => void;
  onSend: (content: string) => void;
  onRetry: () => void;
  onDismissTooLong: () => void;
};

/** Panel content: greeting, transcript, state notice, and composer. */
export function AssistantPanel({
  messages,
  pending,
  streamingId,
  issue,
  blockKind,
  remaining,
  locale,
  signInHref,
  draft,
  autoFocus = false,
  onDraftChange,
  onSend,
  onRetry,
  onDismissTooLong,
}: AssistantPanelProps) {
  const t = useTranslations("assistant");
  const logRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const tooLong =
    draft.length > MAX_QUESTION_CHARS
      ? {
          kind: "too_long" as const,
          retryable: false,
          max: MAX_QUESTION_CHARS,
          count: draft.length,
        }
      : null;
  const visibleIssue = blockKind ? null : (tooLong ?? issue);
  const notice = visibleIssue
    ? { kind: visibleIssue.kind, issue: visibleIssue }
    : blockKind
      ? { kind: blockKind, issue: issue?.kind === blockKind ? issue : undefined }
      : null;
  const canSend =
    !pending && !blockKind && draft.trim() !== "" && draft.length <= MAX_QUESTION_CHARS;
  const lowQuota =
    !blockKind && remaining !== null && remaining > 0 && remaining <= LOW_QUOTA_THRESHOLD;
  const lastContent = messages.at(-1)?.content.length ?? 0;

  // Follow the answer as it streams, unless the customer scrolled up to read.
  useEffect(() => {
    const log = logRef.current;
    if (log && pinnedRef.current) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages.length, lastContent, pending]);

  function submit() {
    if (!canSend) {
      return;
    }
    const content = draft.trim();
    onDraftChange("");
    pinnedRef.current = true;
    onSend(content);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={pending}
        aria-label={t("transcript")}
        onScroll={(event) => {
          const log = event.currentTarget;
          pinnedRef.current = log.scrollHeight - log.scrollTop - log.clientHeight < STICK_DISTANCE;
        }}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
      >
        <div className="flex items-end gap-2">
          <LogoMark className="size-7" />
          <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-neutral-100 px-4 py-3 text-small text-navy-900">
            <p className="font-semibold">{t("greeting")}</p>
            <p className="mt-1">{t("empty")}</p>
            <p className="mt-2 text-caption text-neutral-600">{t("intro")}</p>
          </div>
        </div>

        {messages.length === 0 && !blockKind ? (
          <div className="flex flex-col items-start gap-2 pl-9">
            <p className="inline-flex items-center gap-1.5 text-caption font-semibold text-neutral-600">
              <Sparkle aria-hidden size={14} weight="fill" />
              {t("suggestionsLabel")}
            </p>
            <ul className="flex flex-col items-start gap-2">
              {SUGGESTIONS.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      pinnedRef.current = true;
                      onSend(t(`suggestions.${key}`));
                    }}
                    className="rounded-full border border-neutral-300 bg-white px-3.5 py-2 text-left text-small text-navy-900 transition-colors duration-150 hover:border-navy-900 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {t(`suggestions.${key}`)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {messages.map((message) => (
          <AssistantMessageView
            key={message.id}
            message={message}
            locale={locale}
            thinking={
              pending && streamingId === message.id && message.content === "" ? t("thinking") : null
            }
          />
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-neutral-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        {notice ? (
          <AssistantNotice
            kind={notice.kind}
            issue={notice.issue}
            signInHref={signInHref}
            pending={pending}
            onRetry={onRetry}
          />
        ) : null}

        {lowQuota ? (
          <p role="status" className="flex items-center gap-2 text-caption text-warning-700">
            <Warning aria-hidden size={16} weight="bold" />
            {t("lowQuota", { count: remaining })}
          </p>
        ) : null}

        {blockKind ? null : (
          <AssistantComposer
            value={draft}
            onChange={(value) => {
              onDraftChange(value);
              onDismissTooLong();
            }}
            onSubmit={submit}
            pending={pending}
            canSend={canSend}
            tooLong={tooLong !== null}
            autoFocus={autoFocus}
          />
        )}

        <p className="flex items-start gap-1.5 text-caption text-neutral-600">
          <ShieldCheck aria-hidden size={14} className="mt-px shrink-0" />
          {t("privacyNote")}
        </p>
      </div>
    </div>
  );
}
