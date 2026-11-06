"use client";

import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { cx } from "./cx";
import { IconButton } from "./icon-button";

export type ModalSurfaceProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  variant: "dialog" | "drawer-left" | "drawer-right";
  className?: string;
};

const panelMotion = {
  dialog: { initial: { opacity: 0, y: 12, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 } },
  "drawer-left": { initial: { x: "-100%" }, animate: { x: 0 } },
  "drawer-right": { initial: { x: "100%" }, animate: { x: 0 } },
} as const;

const panelLayout = {
  dialog: "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg rounded-md",
  "drawer-left": "mr-auto h-dvh w-[min(22rem,calc(100%-3rem))]",
  "drawer-right": "ml-auto h-dvh w-[min(22rem,calc(100%-3rem))]",
} as const;

/**
 * Shared modal built on the native `<dialog>` element: the browser traps
 * focus, closes on Escape, and restores focus to the trigger. Motion only
 * animates transform and opacity, and the app-wide MotionConfig skips the
 * animation when the user prefers reduced motion.
 */
export function ModalSurface({
  open,
  onClose,
  title,
  closeLabel,
  children,
  footer,
  variant,
  className,
}: ModalSurfaceProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the dialog element itself is a click on the backdrop area.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-transparent"
    >
      <div
        className="flex h-full w-full"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <AnimatePresence onExitComplete={() => ref.current?.close()}>
          {open ? (
            <motion.div
              key="panel"
              initial={panelMotion[variant].initial}
              animate={panelMotion[variant].animate}
              exit={panelMotion[variant].initial}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className={cx(
                "flex flex-col overflow-hidden bg-white text-navy-900 shadow-overlay",
                panelLayout[variant],
                className,
              )}
            >
              <div className="flex items-center justify-between gap-4 border-b border-neutral-200 py-2 pr-2 pl-5">
                <h2 id={titleId} className="text-heading-sm font-semibold">
                  {title}
                </h2>
                <IconButton
                  label={closeLabel}
                  icon={<X aria-hidden size={20} />}
                  onClick={onClose}
                />
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
              {footer ? (
                <div className="flex flex-wrap justify-end gap-3 border-t border-neutral-200 px-5 py-4">
                  {footer}
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </dialog>
  );
}
