import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./utils";

interface DialogProps {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  origin?: "center" | "top";
}

export function Dialog({
  ariaLabel,
  ariaLabelledBy,
  children,
  className,
  dismissible = true,
  initialFocusRef,
  onClose,
  origin = "top",
}: DialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    document.activeElement as HTMLElement | null,
  );

  useEffect(() => {
    const previous = restoreFocusRef.current;
    const frame = window.requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ?? focusableElements(panelRef.current)[0];
      target?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      previous?.focus();
    };
  }, [initialFocusRef]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && dismissible) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableElements(panelRef.current);
    if (items.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <Scrim origin={origin} onDismiss={dismissible ? onClose : undefined}>
      <section
        ref={panelRef}
        className={cx("ui-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {children}
      </section>
    </Scrim>,
    document.body,
  );
}

export function Scrim({
  children,
  onDismiss,
  origin = "top",
}: {
  children: ReactNode;
  onDismiss?: () => void;
  origin?: "center" | "top";
}) {
  return (
    <div
      className="ui-scrim"
      data-origin={origin}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      {children}
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="ui-dialog-actions">{children}</div>;
}

function focusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}
