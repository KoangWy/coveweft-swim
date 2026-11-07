"use client";

import { ArrowClockwise, Info, Warning, WarningCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { Link } from "@/i18n/navigation";

import { MAX_QUESTION_CHARS, type AssistantIssue, type AssistantIssueKind } from "./assistant-chat";

type NoticeTone = "info" | "warning" | "error";

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

export type AssistantNoticeProps = {
  kind: AssistantIssueKind;
  issue?: AssistantIssue;
  signInHref: string;
  pending: boolean;
  onRetry: () => void;
};

/** One state message with the action that resolves it, when there is one. */
export function AssistantNotice({
  kind,
  issue,
  signInHref,
  pending,
  onRetry,
}: AssistantNoticeProps) {
  const t = useTranslations("assistant");
  const copy = (() => {
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
          body: t("tooLongBody", { max: issue?.max ?? MAX_QUESTION_CHARS }),
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
  })();

  const showRetry = issue?.retryable === true && (kind === "error" || kind === "interrupted");
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
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={pending}>
            <ArrowClockwise aria-hidden size={18} />
            {t("retry")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
