import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button, type ButtonProps } from "./Button";
import { cx } from "./utils";

interface MenuSurfaceProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onClose: () => void;
  position?: { x: number; y: number };
}

export function MenuSurface({
  ariaLabel,
  children,
  className,
  onClose,
  position,
}: MenuSurfaceProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [resolvedPosition, setResolvedPosition] = useState(position);

  useLayoutEffect(() => {
    if (!position || !menuRef.current) return;
    const bounds = menuRef.current.getBoundingClientRect();
    const inset = 8;
    setResolvedPosition({
      x: Math.max(
        inset,
        Math.min(position.x, window.innerWidth - bounds.width - inset),
      ),
      y: Math.max(
        inset,
        Math.min(position.y, window.innerHeight - bounds.height - inset),
      ),
    });
  }, [position]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      menuItems(menuRef.current)[0]?.focus();
    });
    const closeFromOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", closeFromOutside);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [onClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menuRef.current);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape" || event.key === "Tab") {
      onClose();
      return;
    }
    if (next !== null && items[next]) {
      event.preventDefault();
      items[next].focus();
    }
  };

  const menu = (
    <div
      ref={menuRef}
      className={cx("ui-menu", className)}
      role="menu"
      aria-label={ariaLabel}
      data-positioned={position ? true : undefined}
      style={
        resolvedPosition
          ? ({
              left: resolvedPosition.x,
              top: resolvedPosition.y,
            } as CSSProperties)
          : undefined
      }
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );

  return position ? createPortal(menu, document.body) : menu;
}

export function MenuItem({ className, ...props }: ButtonProps) {
  return (
    <Button
      className={cx("ui-menu-item", className)}
      role="menuitem"
      variant="text"
      {...props}
    />
  );
}

function menuItems(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)',
    ),
  );
}
