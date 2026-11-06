import { useId, type ReactNode, type TextareaHTMLAttributes } from "react";

import { cx } from "./cx";
import { controlBorder, controlClasses, Field, fieldDescriptionIds } from "./field";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  requiredLabel?: string;
  containerClassName?: string;
};

export function Textarea({
  id,
  label,
  hint,
  error,
  required,
  requiredLabel,
  className,
  containerClassName,
  rows = 3,
  ...props
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <Field
      id={textareaId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      requiredLabel={requiredLabel}
      className={containerClassName}
    >
      <textarea
        id={textareaId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescriptionIds(textareaId, hint, error)}
        className={cx(controlClasses, controlBorder(Boolean(error)), "py-2.5", className)}
        {...props}
      />
    </Field>
  );
}
