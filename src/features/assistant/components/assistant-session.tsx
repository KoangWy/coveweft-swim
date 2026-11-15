"use client";

import { useEffect } from "react";

import { AssistantProvider, useAssistant } from "./assistant-provider";
import { AssistantWidget } from "./assistant-widget";

export { AssistantProvider };

/**
 * Passes the request session into the assistant provider and renders the
 * launcher. It streams inside its own Suspense boundary, so the storefront
 * does not wait for the session lookup. `policyNotice` is true when the
 * customer agreed to an older privacy notice than the current one.
 */
export function AssistantSession({
  userId,
  policyNotice,
}: {
  userId: string | null;
  policyNotice: boolean;
}) {
  const { setSession } = useAssistant();

  useEffect(() => {
    setSession(userId);
  }, [setSession, userId]);

  return <AssistantWidget policyNotice={policyNotice} />;
}
