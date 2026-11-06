"use client";

import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cx } from "./cx";

export type ToastTone = "info" | "success" | "error";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before the toast hides itself. Errors stay until dismissed. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastContextValue = {
  show: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { icon: ReactNode; className: string }> = {
  info: {
    icon: <Info aria-hidden size={20} className="text-navy-900" />,
    className: "border-neutral-200",
  },
  success: {
    icon: <CheckCircle aria-hidden size={20} className="text-success-700" />,
    className: "border-success-200",
  },
  error: {
    icon: <WarningCircle aria-hidden size={20} className="text-error-700" />,
    className: "border-error-200",
  },
};

function ToastCard({
  toast,
  dismissLabel,
  onDismiss,
}: {
  toast: ToastItem;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "info";
  const duration = toast.duration ?? (tone === "error" ? 0 : 5000);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (duration <= 0) {
      return;
    }
    const timer = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cx(
        "pointer-events-auto flex w-full items-start gap-3 rounded-md border bg-white p-4 shadow-overlay",
        toneStyles[tone].className,
      )}
    >
      <span className="mt-0.5 shrink-0">{toneStyles[tone].icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-small font-semibold text-navy-900">{toast.title}</p>
        {toast.description ? (
          <p className="text-small text-neutral-600">{toast.description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-navy-900 hover:bg-neutral-100"
      >
        <X aria-hidden size={16} />
      </button>
    </motion.li>
  );
}

/**
 * Provides `useToast()`. Toasts are for short, transient feedback; form errors
 * stay inline next to the field.
 */
export function ToastProvider({
  children,
  regionLabel,
  dismissLabel,
}: {
  children: ReactNode;
  regionLabel: string;
  dismissLabel: string;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label={regionLabel}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-(--z-toast) flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6"
      >
        <ol className="flex w-full flex-col gap-2 sm:w-96">
          <AnimatePresence initial={false}>
            {toasts.map((toast) => (
              <ToastCard
                key={toast.id}
                toast={toast}
                dismissLabel={dismissLabel}
                onDismiss={() => dismiss(toast.id)}
              />
            ))}
          </AnimatePresence>
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
