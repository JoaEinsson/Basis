import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { displayTrackTitle } from "../library/format";
import { EmptyState, IconButton, InlineStatus, ScrollRegion } from "../ui";
import { usePlayer } from "./PlayerContext";

export function QueuePane() {
  const player = usePlayer();
  const snapshot = player.snapshot;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!player.queueOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() =>
      closeRef.current?.focus({ preventScroll: true }),
    );
    return () => {
      window.cancelAnimationFrame(frame);
      window.requestAnimationFrame(() => previous?.focus());
    };
  }, [player.queueOpen]);

  if (!player.queueOpen || !snapshot) return null;

  const itemsById = new Map(
    snapshot.queue.map((item) => [item.queueId, item] as const),
  );
  const ordered = snapshot.playOrder.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
  const currentId = snapshot.currentTrack?.queueId;
  const close = () => player.setQueueOpen(false);

  return (
    <div className="queue-layer">
      <div className="queue-scrim" aria-hidden="true" onMouseDown={close} />
      <aside
        className="queue-pane"
        aria-labelledby="queue-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <header>
          <div>
            <h2 id="queue-title">Queue</h2>
            <p>{ordered.length} tracks · local session</p>
          </div>
          <IconButton ref={closeRef} aria-label="Close queue" onClick={close}>
            <X aria-hidden="true" size={18} />
          </IconButton>
        </header>
        {snapshot.error && (
          <InlineStatus tone="error">{snapshot.error}</InlineStatus>
        )}
        {ordered.length === 0 ? (
          <EmptyState title="Queue is empty">
            Start an album, playlist, or track to build this local session.
          </EmptyState>
        ) : (
          <ScrollRegion className="queue-scroll">
            <ol className="queue-items">
              {ordered.map((item, index) => {
                const title = displayTrackTitle(
                  item.track.title,
                  item.track.relPath,
                );
                return (
                  <li
                    key={item.queueId}
                    data-current={item.queueId === currentId || undefined}
                  >
                    <span className="queue-position">{index + 1}</span>
                    <span>
                      <strong>{title}</strong>
                      <small>{item.track.artist ?? "Unknown artist"}</small>
                    </span>
                  </li>
                );
              })}
            </ol>
          </ScrollRegion>
        )}
      </aside>
    </div>
  );
}
