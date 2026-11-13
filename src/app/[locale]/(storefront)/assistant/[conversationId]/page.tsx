import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadCurrentUser } from "@/features/account/components/session";
import { AssistantPage } from "@/features/assistant/components/assistant-page";
import { loadConversation } from "@/features/assistant/components/load-conversation";
import type { Locale } from "@/lib/locale";
import { PRIVACY_POLICY_VERSION } from "@/lib/site";
import { listMyConversations } from "@/server/assistant";

type Props = PageProps<"/[locale]/assistant/[conversationId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = await getTranslations("assistant");
  const { conversationId } = await params;
  const user = await loadCurrentUser();

  if (user) {
    const detail = await loadConversation(conversationId, (await getLocale()) as Locale);

    if (!detail.ok) {
      notFound();
    }

    return {
      title: detail.data.conversation.title,
      description: t("pageIntro"),
      robots: { index: false, follow: true },
    };
  }

  return {
    title: t("pageTitle"),
    description: t("pageIntro"),
    robots: { index: false, follow: true },
  };
}

export default async function AssistantConversationPage({ params }: Props) {
  const { conversationId } = await params;
  const user = await loadCurrentUser();

  if (!user) {
    return (
      <AssistantPage
        userId={null}
        conversationId={conversationId}
        initialMessages={[]}
        initialConversations={[]}
        initialNextCursor={null}
        policyNotice={false}
      />
    );
  }

  const locale = (await getLocale()) as Locale;
  const conversations = await listMyConversations({});

  if (!conversations.ok) {
    throw new Error(`Could not load conversations (${conversations.error.code}).`);
  }

  const detail = await loadConversation(conversationId, locale);

  if (!detail.ok) {
    if (["NOT_FOUND", "VALIDATION_ERROR", "FORBIDDEN"].includes(detail.error.code)) {
      notFound();
    }

    throw new Error(`Could not load conversation (${detail.error.code}).`);
  }

  return (
    <AssistantPage
      userId={user.id}
      conversationId={detail.data.conversation.id}
      initialMessages={detail.data.messages}
      initialConversations={conversations.data.items}
      initialNextCursor={conversations.data.nextCursor}
      policyNotice={user.privacyPolicyVersion !== PRIVACY_POLICY_VERSION}
    />
  );
}
