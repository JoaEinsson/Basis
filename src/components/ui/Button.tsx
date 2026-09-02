import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cx } from "./utils";

export type ButtonVariant = "default" | "text" | "primary" | "destructive";
export type ButtonSize = "compact" | "default";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      size = "default",
      type = "button",
      variant = "default",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={cx("ui-button", className)}
        data-size={size}
        data-variant={variant}
        type={type}
        {...props}
      />
    );
  },
);

export interface IconButtonProps extends Omit<ButtonProps, "aria-label"> {
  "aria-label": string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, ...props }, ref) {
    return (
      <Button
        ref={ref}
        className={cx("ui-icon-button", className)}
        size="compact"
        {...props}
      />
    );
  },
);
