"use client";

import { SignOut } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * Signs out and clears this tab's session storage, which holds the shopping
 * assistant conversation, so the next person on the device cannot read it.
 */
export function SignOutButton() {
  const t = useTranslations("account");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await signOutAction();
          window.sessionStorage.clear();
          router.replace("/");
          router.refresh();
        })
      }
    >
      <SignOut aria-hidden size={18} />
      {pending ? t("signingOut") : t("signOut")}
    </Button>
  );
}
