import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { IconButton } from "./Button";
import { cx } from "./utils";

export function ArtworkFrame({
  children,
  className,
  hasArtwork,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  hasArtwork?: boolean;
}) {
  return (
    <div
      className={cx("ui-artwork-frame", className)}
      data-has-artwork={hasArtwork || undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export function EntityRow({
  children,
  className,
  playing,
  selected,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  playing?: boolean;
  selected?: boolean;
}) {
  return (
    <div
      className={cx("ui-entity-row", className)}
      data-playing={playing || undefined}
      data-selected={selected || undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export const DragHandle = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    "aria-label": string;
    children: ReactNode;
  }
>(function DragHandle({ className, ...props }, ref) {
  return (
    <IconButton
      ref={ref}
      className={cx("ui-drag-handle", className)}
      {...props}
    />
  );
});

export function DragPreview({
  children,
  dragging,
}: {
  children: ReactNode;
  dragging: boolean;
}) {
  return (
    <span className="ui-drag-preview" data-dragging={dragging || undefined}>
      {children}
    </span>
  );
}

export function InsertionMarker({ active }: { active: boolean }) {
  return (
    <span
      className="ui-insertion-marker"
      data-active={active || undefined}
      aria-hidden="true"
    />
  );
}

export function DropTarget({
  active,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
}) {
  return (
    <div
      className={cx("ui-drop-target", className)}
      data-drop-active={active || undefined}
      {...props}
    >
      {children}
    </div>
  );
}
