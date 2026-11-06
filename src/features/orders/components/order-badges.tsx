import { useTranslations } from "next-intl";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { OrderStatus, PaymentStatus } from "@/server/commerce/types";

const ORDER_TONES: Record<OrderStatus, BadgeTone> = {
  pending: "warning",
  confirmed: "neutral",
  shipping: "neutral",
  delivered: "success",
  cancelled: "soldout",
};

const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = {
  unpaid: "warning",
  paid: "success",
  refunded: "neutral",
};

/** Order status and payment status as two separate labeled badges. */
export function OrderBadges({
  status,
  paymentStatus,
}: {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
}) {
  const t = useTranslations("orders");

  return (
    <span className="inline-flex flex-wrap gap-2">
      <Badge tone={ORDER_TONES[status]}>
        {t("statusLabel", { status: t(`status.${status}`) })}
      </Badge>
      <Badge tone={PAYMENT_TONES[paymentStatus]}>
        {t("paymentLabel", { status: t(`paymentStatus.${paymentStatus}`) })}
      </Badge>
    </span>
  );
}
