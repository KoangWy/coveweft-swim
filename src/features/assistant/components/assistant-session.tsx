"use client";

import { useEffect } from "react";

import { AssistantProvider, useAssistant } from "./assistant-provider";
import { AssistantWidget } from "./assistant-widget";

export { AssistantProvider };

/**
 * Passes the request session into the assistant provider and renders the
 * launcher. It streams inside its own Suspense boundary, so the storefront
 * does not wait for the session lookup.
 */
export function AssistantSession({ userId }: { userId: string | null }) {
  const { setSession } = useAssistant();

  useEffect(() => {
    setSession(userId);
  }, [setSession, userId]);

  return <AssistantWidget />;
}
