"use client";

import { ShieldCheck } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/locale";

import {
  MAX_QUESTION_CHARS,
  type AssistantIssue,
  type AssistantIssueKind,
  type AssistantMessage,
} from "./assistant-chat";
import { AssistantComposer } from "./assistant-composer";
import { AssistantMessageView } from "./assistant-message";
import { AssistantNotice } from "./assistant-notice";

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
  onDraftChange: (value: string) => void;
  onSend: (content: string) => void;
  onRetry: () => void;
  onDismissTooLong: () => void;
};

/** Panel content: privacy note, quota, transcript, notice, and composer. */
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
  onDraftChange,
  onSend,
  onRetry,
  onDismissTooLong,
}: AssistantPanelProps) {
  const t = useTranslations("assistant");
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

  function submit() {
    if (!canSend) {
      return;
    }
    const content = draft.trim();
    onDraftChange("");
    onSend(content);
  }

  return (
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
            <AssistantMessageView
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

      {notice ? (
        <AssistantNotice
          kind={notice.kind}
          issue={notice.issue}
          signInHref={signInHref}
          pending={pending}
          onRetry={onRetry}
        />
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
        />
      )}
    </div>
  );
}
