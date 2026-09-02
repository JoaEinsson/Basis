import { Copy, Minus, Square, X } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { IconButton, IconSwap, Tooltip } from "../ui";
import { currentWindowAdapter, type WindowAdapter } from "./windowAdapter";

interface WindowChromeProps {
  children: ReactNode;
  windowAdapter?: WindowAdapter;
}

export function WindowChrome({
  children,
  windowAdapter = currentWindowAdapter,
}: WindowChromeProps) {
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncMaximized = useCallback(async () => {
    try {
      setMaximized(await windowAdapter.isMaximized());
    } catch (cause) {
      reportWindowActionError(cause);
    }
  }, [windowAdapter]);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;

    void windowAdapter
      .isMaximized()
      .then((value) => {
        if (active) setMaximized(value);
      })
      .catch(reportWindowActionError);
    void windowAdapter
      .subscribeMaximized((value) => {
        if (active) setMaximized(value);
      })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      })
      .catch(reportWindowActionError);

    return () => {
      active = false;
      stop?.();
    };
  }, [windowAdapter]);

  const runWindowAction = useCallback(
    async (action: () => Promise<void>, syncAfter = false) => {
      setError(null);
      try {
        await action();
        if (syncAfter) await syncMaximized();
      } catch (cause) {
        setError("Window action failed.");
        reportWindowActionError(cause);
      }
    },
    [syncMaximized],
  );

  const handleDragStart = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) return;
    void runWindowAction(() => windowAdapter.startDragging());
  };

  return (
    <div className="window-chrome">
      <div
        className="window-drag-region"
        aria-hidden="true"
        onDoubleClick={() =>
          void runWindowAction(() => windowAdapter.toggleMaximize(), true)
        }
        onMouseDown={handleDragStart}
      />
      {children}
      <div
        className="window-controls"
        role="group"
        aria-label="Window controls"
      >
        <Tooltip label="Minimize">
          <IconButton
            className="window-control"
            aria-label="Minimize"
            variant="text"
            onClick={() => void runWindowAction(() => windowAdapter.minimize())}
          >
            <Minus aria-hidden="true" size={17} strokeWidth={1.8} />
          </IconButton>
        </Tooltip>
        <Tooltip label={maximized ? "Restore" : "Maximize"}>
          <IconButton
            className="window-control"
            aria-label={maximized ? "Restore" : "Maximize"}
            variant="text"
            onClick={() =>
              void runWindowAction(() => windowAdapter.toggleMaximize(), true)
            }
          >
            <IconSwap
              active={maximized}
              inactive={
                <Square aria-hidden="true" size={13} strokeWidth={1.8} />
              }
              activeIcon={
                <Copy aria-hidden="true" size={14} strokeWidth={1.8} />
              }
            />
          </IconButton>
        </Tooltip>
        <Tooltip label="Close">
          <IconButton
            className="window-control window-control-close"
            aria-label="Close"
            variant="text"
            onClick={() => void runWindowAction(() => windowAdapter.close())}
          >
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </IconButton>
        </Tooltip>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {error}
      </span>
    </div>
  );
}

function reportWindowActionError(cause: unknown) {
  console.error("Basis could not complete the window action.", cause);
}
