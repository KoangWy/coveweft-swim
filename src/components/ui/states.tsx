import { Package, WarningOctagon } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";

import { cx } from "./cx";

type StateProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** Usually one button or link that resolves the state. */
  action?: ReactNode;
  className?: string;
  /** Heading level for the title, so the state fits the page outline. */
  headingLevel?: 1 | 2 | 3;
};

function StateLayout({
  title,
  description,
  icon,
  action,
  className,
  headingLevel = 2,
  role,
}: StateProps & { role?: "alert" }) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div
      role={role}
      className={cx(
        "flex flex-col items-start gap-4 rounded-md border border-neutral-200 bg-neutral-50 p-6 sm:p-8",
        className,
      )}
    >
      <span className="inline-flex size-12 items-center justify-center rounded-md bg-white text-navy-900 shadow-raised">
        {icon}
      </span>
      <div className="flex max-w-[60ch] flex-col gap-1">
        <Heading className="text-heading-sm font-semibold text-navy-900">{title}</Heading>
        {description ? <p className="text-body text-neutral-600">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
    </div>
  );
}

/** Shown when a list or search has nothing to display. */
export function EmptyState(props: StateProps) {
  return <StateLayout icon={<Package aria-hidden size={24} />} {...props} />;
}

/** Shown when content failed to load. Announced to assistive technology. */
export function ErrorState(props: StateProps) {
  return (
    <StateLayout
      role="alert"
      icon={<WarningOctagon aria-hidden size={24} className="text-error-700" />}
      {...props}
    />
  );
}
