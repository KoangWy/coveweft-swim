import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { loadCurrentUser } from "@/features/account/components/session";
import { AssistantPage } from "@/features/assistant/components/assistant-page";
import { PRIVACY_POLICY_VERSION } from "@/lib/site";
import { listMyConversations } from "@/server/assistant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistant");

  return {
    title: t("pageTitle"),
    description: t("pageIntro"),
    robots: { index: false, follow: true },
  };
}

export default async function NewAssistantPage() {
  const user = await loadCurrentUser();

  if (!user) {
    return (
      <AssistantPage
        userId={null}
        conversationId={null}
        initialMessages={[]}
        initialConversations={[]}
        initialNextCursor={null}
        policyNotice={false}
      />
    );
  }

  const conversations = await listMyConversations({});

  if (!conversations.ok) {
    throw new Error(`Could not load conversations (${conversations.error.code}).`);
  }

  return (
    <AssistantPage
      userId={user.id}
      conversationId={null}
      initialMessages={[]}
      initialConversations={conversations.data.items}
      initialNextCursor={conversations.data.nextCursor}
      policyNotice={user.privacyPolicyVersion !== PRIVACY_POLICY_VERSION}
    />
  );
}
