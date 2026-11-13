"use client";

import { useLocale } from "next-intl";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import type { Locale } from "@/lib/locale";

import { useAssistantChat, type AssistantChat } from "./use-assistant-chat";

export type AssistantContextValue = AssistantChat & {
  /** The signed-in customer, or null before the session resolves. */
  userId: string | null;
  setSession: (userId: string | null) => void;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  draft: string;
  setDraft: (value: string) => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

/**
 * Holds the conversation that the floating panel and the Assistant page
 * share, so expanding the panel or closing it never interrupts an answer
 * that is still streaming. It sits in the storefront frame, above both.
 */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const locale = useLocale() as Locale;
  const [userId, setUserId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const chat = useAssistantChat({ userId, locale });
  const { prefetchStatus, forgetStatus } = chat;

  const openPanel = useCallback(() => {
    prefetchStatus();
    setPanelOpen(true);
  }, [prefetchStatus]);

  const closePanel = useCallback(() => {
    // The answer keeps streaming in the shared state; only the surface closes.
    setPanelOpen(false);
    forgetStatus();
  }, [forgetStatus]);

  return (
    <AssistantContext.Provider
      value={{
        ...chat,
        userId,
        setSession: setUserId,
        panelOpen,
        openPanel,
        closePanel,
        draft,
        setDraft,
      }}
    >
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);

  if (!value) {
    throw new Error("useAssistant must be used inside AssistantProvider.");
  }

  return value;
}
