import {
  forwardRef,
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
>(function RangeInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cx("ui-range", className)}
      type="range"
      {...props}
    />
  );
});

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
