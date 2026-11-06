"use client";

import { ModalSurface, type ModalSurfaceProps } from "./modal-surface";

export type DialogProps = Omit<ModalSurfaceProps, "variant">;

/** Centered modal dialog for confirmations and short forms. */
export function Dialog(props: DialogProps) {
  return <ModalSurface variant="dialog" {...props} />;
}
