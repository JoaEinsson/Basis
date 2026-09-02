import {
  Children,
  cloneElement,
  type ReactElement,
  type ReactNode,
  useId,
} from "react";

interface TooltipProps {
  children: ReactNode;
  label: string;
  placement?: "bottom" | "top";
}

export function Tooltip({
  children,
  label,
  placement = "bottom",
}: TooltipProps) {
  const id = useId();
  const child = Children.only(children) as ReactElement<{
    "aria-describedby"?: string;
  }>;
  const describedBy = [child.props["aria-describedby"], id]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="ui-tooltip-anchor" data-placement={placement}>
      {cloneElement(child, { "aria-describedby": describedBy })}
      <span className="ui-tooltip" id={id} role="tooltip">
        {label}
      </span>
    </span>
  );
}
