import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./utils";

export function Divider() {
  return <hr className="ui-divider" />;
}

export function ScrollRegion({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("ui-scroll-region", className)} {...props} />;
}

export function Skeleton({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className={cx("ui-skeleton", className)} role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Progress({
  label,
  max = 100,
  value,
}: {
  label: string;
  max?: number;
  value?: number;
}) {
  const bounded =
    value === undefined ? undefined : Math.min(max, Math.max(0, value));
  return (
    <span
      className="ui-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={bounded}
      data-indeterminate={bounded === undefined || undefined}
    >
      <span
        style={{
          width:
            bounded === undefined ? undefined : `${(bounded / max) * 100}%`,
        }}
      />
    </span>
  );
}

export function InlineStatus({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "error" | "neutral" | "success";
}) {
  return (
    <span
      className="ui-inline-status"
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  title: string;
}) {
  return (
    <section className="ui-empty-state" aria-label={title}>
      <h2>{title}</h2>
      {children && <div>{children}</div>}
      {action}
    </section>
  );
}

export function LocalErrorState({
  children,
  onRetry,
  title = "Something went wrong",
}: {
  children: ReactNode;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <section className="ui-error-state" role="alert">
      <h2>{title}</h2>
      <div>{children}</div>
      {onRetry && (
        <Button variant="text" onClick={onRetry}>
          Try again
        </Button>
      )}
    </section>
  );
}
