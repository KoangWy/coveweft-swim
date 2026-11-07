"use client";

import { PaperPlaneRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";

import { MAX_QUESTION_CHARS } from "./assistant-chat";

export type AssistantComposerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Sends the current question. The parent clears the draft. */
  onSubmit: () => void;
  pending: boolean;
  canSend: boolean;
  tooLong: boolean;
};

/** The question field, character limit, and send button. */
export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  pending,
  canSend,
  tooLong,
}: AssistantComposerProps) {
  const t = useTranslations("assistant");
  const inputId = useId();

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (canSend) {
      onSubmit();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) {
        onSubmit();
      }
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-small font-medium text-navy-900">
        {t("inputLabel")}
      </label>
      <textarea
        id={inputId}
        rows={2}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
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
            count: value.length,
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
  );
}
