import type { ReactNode } from "react";

interface IconSwapProps {
  active: boolean;
  activeIcon: ReactNode;
  inactiveIcon: ReactNode;
}

export function IconSwap({ active, activeIcon, inactiveIcon }: IconSwapProps) {
  return (
    <span className="ui-icon-swap" aria-hidden="true">
      <span data-visible={!active || undefined}>{inactiveIcon}</span>
      <span data-visible={active || undefined}>{activeIcon}</span>
    </span>
  );
}
