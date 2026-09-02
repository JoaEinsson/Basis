import {
  forwardRef,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cx } from "./utils";

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx("ui-input", className)}
      type={type}
      {...props}
    />
  );
});

export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function SearchInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx("ui-input ui-search-input", className)}
      type="search"
      {...props}
    />
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cx("ui-input", className)} {...props} />
  );
});

export const SelectInput = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function SelectInput({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cx("ui-select", className)} {...props}>
      {children}
    </select>
  );
});

export const RangeInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function RangeInput(
  {
    className,
    defaultValue,
    max = 100,
    min = 0,
    onInput,
    style,
    value,
    ...props
  },
  ref,
) {
  const progress = rangeProgress(value ?? defaultValue, min, max);

  return (
    <input
      ref={ref}
      className={cx("ui-range", className)}
      defaultValue={defaultValue}
      max={max}
      min={min}
      onInput={(event) => {
        event.currentTarget.style.setProperty(
          "--ui-range-progress",
          `${rangeProgress(
            event.currentTarget.value,
            event.currentTarget.min,
            event.currentTarget.max,
          )}%`,
        );
        onInput?.(event);
      }}
      style={
        {
          ...style,
          "--ui-range-progress": `${progress}%`,
        } as CSSProperties
      }
      type="range"
      value={value}
      {...props}
    />
  );
});

function rangeProgress(
  value: string | number | readonly string[] | undefined,
  min: string | number,
  max: string | number,
) {
  const minimum = finiteNumber(min, 0);
  const maximum = finiteNumber(max, 100);
  const current = finiteNumber(value, minimum);
  return maximum > minimum
    ? Math.min(
        100,
        Math.max(0, ((current - minimum) / (maximum - minimum)) * 100),
      )
    : 0;
}

function finiteNumber(
  value: string | number | readonly string[] | undefined,
  fallback: number,
) {
  if (Array.isArray(value)) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> {
  children: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ children, className, ...props }, ref) {
    return (
      <label className={cx("ui-checkbox", className)}>
        <input ref={ref} type="checkbox" {...props} />
        <span className="ui-checkbox-indicator" aria-hidden="true" />
        <span>{children}</span>
      </label>
    );
  },
);

export const Toggle = forwardRef<HTMLInputElement, CheckboxProps>(
  function Toggle({ children, className, ...props }, ref) {
    return (
      <label className={cx("ui-toggle", className)}>
        <input ref={ref} type="checkbox" role="switch" {...props} />
        <span className="ui-toggle-track" aria-hidden="true">
          <span />
        </span>
        <span>{children}</span>
      </label>
    );
  },
);
