"use client";

import { ChatCircleDots } from "@phosphor-icons/react";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

import { requestAssistantOpen } from "./assistant-events";

/** Opens the shopping assistant panel from anywhere on the page. */
export function AssistantOpenButton({
  label,
  variant = "primary",
  size = "lg",
}: {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Button size={size} variant={variant} aria-haspopup="dialog" onClick={requestAssistantOpen}>
      <ChatCircleDots aria-hidden size={22} weight="fill" />
      {label}
    </Button>
  );
}
