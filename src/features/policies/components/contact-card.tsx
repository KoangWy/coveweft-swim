import { ArrowSquareOut, ChatCircleText } from "@phosphor-icons/react/ssr";
import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/button";
import { PROJECT_CONTACT_URL } from "@/lib/site";

/** The project's public contact channel, used by the contact and privacy pages. */
export function ContactCard() {
  const t = useTranslations("policies.contactCard");

  return (
    <div className="flex flex-col gap-5 rounded-md border border-neutral-200 bg-neutral-50 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-lime-400 text-navy-950">
          <ChatCircleText aria-hidden size={22} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-body font-semibold text-navy-900">{t("title")}</h2>
          <p className="max-w-[48ch] text-small text-neutral-700">{t("body")}</p>
        </div>
      </div>
      <a
        href={PROJECT_CONTACT_URL}
        className={buttonClasses({ variant: "secondary", className: "self-start sm:self-center" })}
      >
        {t("action")}
        <ArrowSquareOut aria-hidden size={18} />
      </a>
    </div>
  );
}
