"use client";

import { ModalSurface, type ModalSurfaceProps } from "./modal-surface";

export type DrawerProps = Omit<ModalSurfaceProps, "variant"> & {
  side?: "left" | "right";
};

/** Side sheet used for mobile navigation and the mobile filter panel. */
export function Drawer({ side = "left", ...props }: DrawerProps) {
  return <ModalSurface variant={side === "left" ? "drawer-left" : "drawer-right"} {...props} />;
}
