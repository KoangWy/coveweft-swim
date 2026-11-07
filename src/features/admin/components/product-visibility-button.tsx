"use client";

import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setProductActiveAction } from "@/features/admin/actions";

export type ProductVisibilityButtonProps = {
  productId: string;
  name: string;
  isActive: boolean;
  size?: "sm" | "md";
};

/**
 * Hides a product from the storefront or restores it. Hiding is reversible;
 * no admin action deletes a product that orders may refer to.
 */
export function ProductVisibilityButton({
  productId,
  name,
  isActive,
  size = "sm",
}: ProductVisibilityButtonProps) {
  const t = useTranslations("admin.productsPage");
  const te = useTranslations("errors");
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setProductActiveAction(productId, !isActive);

      if (result.ok) {
        toast.show({
          tone: "success",
          title: isActive ? t("hiddenToast", { name }) : t("shownToast", { name }),
        });
      } else {
        setError(te(result.code));
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={isActive ? "secondary" : "primary"}
        size={size}
        onClick={toggle}
        disabled={pending}
        aria-busy={pending}
      >
        {isActive ? <EyeSlash aria-hidden size={16} /> : <Eye aria-hidden size={16} />}
        {pending ? t("updating") : isActive ? t("hide") : t("show")}
      </Button>
      {error ? (
        <p role="alert" className="max-w-56 text-caption text-error-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
