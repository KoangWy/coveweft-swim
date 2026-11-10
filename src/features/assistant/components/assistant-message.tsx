"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { LogoMark } from "@/components/layout/logo-mark";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/ui/price";
import { ProductImage } from "@/components/ui/product-image";
import type { Locale } from "@/lib/locale";

import type { AssistantMessage, AssistantProductCard } from "./assistant-chat";
import { AssistantMarkdownView } from "./assistant-markdown-view";

function ProductCards({ cards, locale }: { cards: AssistantProductCard[]; locale: Locale }) {
  const t = useTranslations("assistant");

  return (
    <ul aria-label={t("products")} className="mt-2 grid gap-2">
      {cards.map((card) => (
        <li
          key={card.sku}
          className="group relative flex gap-3 rounded-lg border border-neutral-200 bg-white p-2 transition-[border-color,box-shadow] duration-150 hover:border-navy-900 hover:shadow-raised"
        >
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
              className="rounded-md text-small font-semibold text-navy-900 after:absolute after:inset-0 after:rounded-lg"
            >
              {card.name}
            </a>
            <Price amount={card.priceVnd} locale={locale} size="sm" />
            <Badge tone={card.inStock ? "success" : "soldout"}>
              {card.inStock ? t("cardInStock") : t("cardSoldOut")}
            </Badge>
          </div>
          <ArrowRight
            aria-hidden
            size={18}
            className="mr-1 self-center text-neutral-500 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-navy-900"
          />
        </li>
      ))}
    </ul>
  );
}

function TypingDots({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-neutral-600">
      <span aria-hidden className="inline-flex gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 rounded-full bg-neutral-500 motion-safe:animate-bounce"
            style={{ animationDelay: `${dot * 140}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
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

  if (message.role === "user") {
    return (
      <article aria-label={t("you")} className="flex justify-end">
        <p className="max-w-[85%] rounded-lg rounded-br-sm bg-navy-900 px-4 py-2.5 text-small whitespace-pre-wrap text-white">
          {message.content}
        </p>
      </article>
    );
  }

  return (
    <article aria-label={t("assistant")} className="flex items-end gap-2">
      <LogoMark className="size-7" />
      <div className="max-w-[85%] min-w-0">
        <div className="rounded-lg rounded-bl-sm bg-neutral-100 px-4 py-3 text-small text-navy-900">
          {message.content ? (
            <AssistantMarkdownView text={message.content} />
          ) : thinking ? (
            <TypingDots label={thinking} />
          ) : null}
          {message.interrupted ? (
            <span className="mt-1 block text-caption font-semibold text-warning-700">
              {t("interruptedLabel")}
            </span>
          ) : null}
        </div>
        {message.cards.length > 0 ? <ProductCards cards={message.cards} locale={locale} /> : null}
      </div>
    </article>
  );
}
