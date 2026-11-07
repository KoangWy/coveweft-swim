"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import type { Locale } from "@/lib/locale";

import type { AssistantMessage, AssistantProductCard } from "./assistant-chat";

function ProductCards({ cards, locale }: { cards: AssistantProductCard[]; locale: Locale }) {
  const t = useTranslations("assistant");

  return (
    <ul aria-label={t("products")} className="mt-2 grid gap-2">
      {cards.map((card) => (
        <li key={card.sku} className="flex gap-3 rounded-md border border-neutral-200 p-2">
          <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md">
            <ProductImage
              src={card.imageUrl}
              alt={card.name}
              fallbackLabel={t("imageUnavailable")}
              fill
              sizes="56px"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <a
              href={card.url}
              className="rounded-md text-small font-semibold text-navy-900 underline underline-offset-2 hover:no-underline"
            >
              {card.name}
            </a>
            <Price amount={card.priceVnd} locale={locale} size="sm" />
            <Badge tone={card.inStock ? "success" : "soldout"}>
              {card.inStock ? t("cardInStock") : t("cardSoldOut")}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

export type AssistantMessageViewProps = {
  message: AssistantMessage;
  locale: Locale;
  thinking: string | null;
};

/** One user or assistant turn, with product cards when the turn has them. */
export function AssistantMessageView({ message, locale, thinking }: AssistantMessageViewProps) {
  const t = useTranslations("assistant");
  const isUser = message.role === "user";

  return (
    <article aria-label={isUser ? t("you") : t("assistant")}>
      <p className="text-caption font-semibold text-neutral-600">
        {isUser ? t("you") : t("assistant")}
      </p>
      <div
        className={cx(
          "mt-1 rounded-md px-3 py-2 text-small whitespace-pre-wrap text-navy-900",
          isUser ? "bg-neutral-100" : "border-l-2 border-lime-500 bg-neutral-50",
        )}
      >
        {message.content ? (
          message.content
        ) : thinking ? (
          <span className="text-neutral-600">{thinking}</span>
        ) : null}
        {message.interrupted ? (
          <span className="mt-1 block text-caption font-semibold text-warning-700">
            {t("interruptedLabel")}
          </span>
        ) : null}
      </div>
      {message.cards.length > 0 ? <ProductCards cards={message.cards} locale={locale} /> : null}
    </article>
  );
}
