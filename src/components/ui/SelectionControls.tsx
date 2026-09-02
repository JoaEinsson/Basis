import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useRef,
} from "react";
import { Button } from "./Button";
import { cx } from "./utils";

export type SegmentOption<T extends string> = {
  label: string;
  value: T;
  content?: ReactNode;
};

interface SegmentedControlProps<T extends string> {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: Array<SegmentOption<T>>;
  value: T;
}

export function SegmentedControl<T extends string>({
  ariaLabel,
  className,
  onChange,
  options,
  value,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selectFromKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={cx("ui-segmented-control", className)}
      role="radiogroup"
      aria-label={ariaLabel}
      style={
        {
          "--ui-segment-count": options.length,
          "--ui-segment-index": activeIndex,
        } as CSSProperties
      }
    >
      <span className="ui-segmented-indicator" aria-hidden="true" />
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <Button
            ref={(element) => {
              refs.current[index] = element;
            }}
            key={option.value}
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            tabIndex={active ? 0 : -1}
            variant="text"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => selectFromKeyboard(event, index)}
          >
            {option.content ?? option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>(props: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.value),
  );
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % props.options.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + props.options.length) % props.options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = props.options.length - 1;
    else return;
    event.preventDefault();
    const option = props.options[next];
    if (!option) return;
    props.onChange(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      className={cx("ui-tabs", props.className)}
      role="tablist"
      aria-label={props.ariaLabel}
      style={
        {
          "--ui-segment-count": props.options.length,
          "--ui-segment-index": activeIndex,
        } as CSSProperties
      }
    >
      <span className="ui-tab-indicator" aria-hidden="true" />
      {props.options.map((option, index) => {
        const active = option.value === props.value;
        return (
          <Button
            ref={(element) => {
              refs.current[index] = element;
            }}
            key={option.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            variant="text"
            onClick={() => props.onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
          >
            {option.content ?? option.label}
          </Button>
        );
      })}
    </div>
  );
}

export function FilterChip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
}) {
  return (
    <Button
      className={cx("ui-filter-chip", className)}
      data-active={active || undefined}
      aria-pressed={active}
      variant="text"
      {...props}
    >
      {children}
    </Button>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "accent" | "error" | "neutral" | "success";
}) {
  return (
    <span className="ui-badge" data-tone={tone}>
      {children}
    </span>
  );
}
