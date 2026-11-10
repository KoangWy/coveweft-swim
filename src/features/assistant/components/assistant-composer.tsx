"use client";

import { ArrowUp, CircleNotch } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId, type KeyboardEvent } from "react";

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
  autoFocus?: boolean;
};

/**
 * The question field and send button. The field grows with its text up to a
 * few lines; Enter sends and Shift+Enter adds a line.
 */
export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  pending,
  canSend,
  tooLong,
  autoFocus = false,
}: AssistantComposerProps) {
  const t = useTranslations("assistant");
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-too-long`;

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
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="sr-only">
        {t("inputLabel")}
      </label>
      <div
        className={cx(
          "flex items-end gap-2 rounded-lg border bg-white py-1.5 pr-1.5 pl-4 transition-colors duration-150 focus-within:border-navy-900 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-navy-900",
          tooLong ? "border-error-700" : "border-neutral-500 hover:border-navy-900",
        )}
      >
        <textarea
          id={inputId}
          rows={1}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("placeholder")}
          aria-invalid={tooLong ? true : undefined}
          aria-describedby={tooLong ? `${errorId} ${hintId}` : hintId}
          className="field-sizing-content max-h-36 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-body text-navy-900 focus:outline-none"
        />
        <button
          type="submit"
          aria-label={t("send")}
          title={t("send")}
          disabled={!canSend}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-lime-400 text-navy-950 transition-[background-color,transform] duration-150 hover:bg-lime-500 active:scale-95 disabled:bg-neutral-100 disabled:text-neutral-500"
        >
          {pending ? (
            <CircleNotch aria-hidden size={18} weight="bold" className="animate-spin" />
          ) : (
            <ArrowUp aria-hidden size={18} weight="bold" />
          )}
        </button>
      </div>
      <p id={hintId} className="sr-only">
        {t("composerHint", { max: MAX_QUESTION_CHARS })}
      </p>
      {tooLong ? (
        <p id={errorId} className="text-small text-error-700">
          {t("tooLongCount", {
            count: value.length,
            max: MAX_QUESTION_CHARS,
          })}
        </p>
      ) : null}
    </form>
  );
}
