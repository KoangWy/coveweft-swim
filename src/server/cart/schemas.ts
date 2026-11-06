import { z } from "zod";

const quantityInput = z.number().int().min(1).max(99);

export const AddToCartInput = z.object({
  variantId: z.uuid(),
  quantity: quantityInput,
});

export type AddToCartInput = z.infer<typeof AddToCartInput>;

export const UpdateCartItemInput = z.object({
  variantId: z.uuid(),
  quantity: quantityInput,
});

export type UpdateCartItemInput = z.infer<typeof UpdateCartItemInput>;

export const RemoveCartItemInput = z.object({
  variantId: z.uuid(),
});

export type RemoveCartItemInput = z.infer<typeof RemoveCartItemInput>;
