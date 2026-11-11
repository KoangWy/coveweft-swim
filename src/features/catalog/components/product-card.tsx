import { imageSources } from "./image-sources";
import { ProductCardView, type ProductCardViewProps } from "./product-card-view";

export type ProductCardProps = Omit<ProductCardViewProps, "primary" | "secondary">;

/** Resolves media on the server; shop and favorites share the same card view. */
export function ProductCard(props: ProductCardProps) {
  return (
    <ProductCardView
      {...props}
      primary={imageSources(props.product.images[0]).medium}
      secondary={imageSources(props.product.images[1]).medium}
    />
  );
}
