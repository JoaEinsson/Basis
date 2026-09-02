import {
  Children,
  cloneElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cx } from "./utils";

interface PopoverProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger: ReactNode;
}

export function Popover({
  ariaLabel,
  children,
  className,
  onOpenChange,
  open,
  trigger,
}: PopoverProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const triggerElement = Children.only(trigger) as ReactElement<{
    "aria-controls"?: string;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: "dialog";
    onClick?: (event: MouseEvent<HTMLElement>) => void;
  }>;

  useEffect(() => {
    if (!resolvedOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeFromEscape);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeFromEscape);
    };
  });

  return (
    <span className="ui-popover-anchor" ref={rootRef}>
      {cloneElement(triggerElement, {
        "aria-controls": resolvedOpen ? id : undefined,
        "aria-expanded": resolvedOpen,
        "aria-haspopup": "dialog",
        onClick: (event) => {
          triggerElement.props.onClick?.(event);
          setOpen(!resolvedOpen);
        },
      })}
      {resolvedOpen && (
        <span
          className={cx("ui-popover", className)}
          id={id}
          role="dialog"
          aria-label={ariaLabel}
        >
          {children}
        </span>
      )}
    </span>
  );
}
