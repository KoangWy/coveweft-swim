import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cx } from "./cx";
import { controlBorder, controlClasses, Field, fieldDescriptionIds } from "./field";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  requiredLabel?: string;
  containerClassName?: string;
};

export function Input({
  id,
  label,
  hint,
  error,
  required,
  requiredLabel,
  className,
  containerClassName,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      requiredLabel={requiredLabel}
      className={containerClassName}
    >
      <input
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={fieldDescriptionIds(inputId, hint, error)}
        className={cx(controlClasses, controlBorder(Boolean(error)), "h-11", className)}
        {...props}
      />
    </Field>
  );
}
