import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { displayTrackTitle } from "../library/format";
import {
  DragHandle,
  EmptyState,
  IconButton,
  InlineStatus,
  InsertionMarker,
  ScrollRegion,
} from "../ui";
import { usePlayer } from "./PlayerContext";

export function QueuePane() {
  const player = usePlayer();
  const snapshot = player.snapshot;
  const closeRef = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

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
  const currentIndex = ordered.findIndex((item) => item.queueId === currentId);
  const close = () => player.setQueueOpen(false);
  const move = async (queueId: string, targetIndex: number, title: string) => {
    const moved = await player.reorderQueue(queueId, targetIndex);
    if (moved) {
      setAnnouncement(`Moved ${title} to queue position ${targetIndex + 1}.`);
    }
    setDropIndex(null);
    draggingRef.current = null;
    setDraggingId(null);
  };

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
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
            <ol className="queue-items">
              {ordered.map((item, index) => {
                const title = displayTrackTitle(
                  item.track.title,
                  item.track.relPath,
                );
                const queueState =
                  index < currentIndex
                    ? "history"
                    : index === currentIndex
                      ? "current"
                      : "upcoming";
                const reorderable = currentIndex < 0 || index > currentIndex;
                return (
                  <li
                    key={item.queueId}
                    data-current={item.queueId === currentId || undefined}
                    data-queue-state={queueState}
                    data-drop-target={dropIndex === index || undefined}
                    data-dragging={draggingId === item.queueId || undefined}
                    onDragOver={(event) => {
                      if (!reorderable || !draggingRef.current) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDropIndex(index);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const queueId =
                        event.dataTransfer.getData(
                          "application/x-basis-queue-id",
                        ) || draggingRef.current;
                      if (queueId && reorderable) {
                        const source = ordered.find(
                          (candidate) => candidate.queueId === queueId,
                        );
                        void move(
                          queueId,
                          index,
                          source
                            ? displayTrackTitle(
                                source.track.title,
                                source.track.relPath,
                              )
                            : "track",
                        );
                      }
                    }}
                  >
                    <InsertionMarker active={dropIndex === index} />
                    <span className="queue-position">{index + 1}</span>
                    <span className="queue-item-copy">
                      <strong>{title}</strong>
                      <small>{item.track.artist ?? "Unknown artist"}</small>
                    </span>
                    <span className="queue-item-state">
                      {queueState === "current"
                        ? "Now playing"
                        : queueState === "history"
                          ? "Played"
                          : index === currentIndex + 1
                            ? "Up next"
                            : "Upcoming"}
                    </span>
                    <span className="queue-reorder-controls">
                      <DragHandle
                        draggable={reorderable}
                        disabled={!reorderable}
                        aria-label={`Drag ${title} to reorder`}
                        onDragStart={(event) => {
                          draggingRef.current = item.queueId;
                          setDraggingId(item.queueId);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "application/x-basis-queue-id",
                            item.queueId,
                          );
                          event.dataTransfer.setData("text/plain", title);
                        }}
                        onDragEnd={() => {
                          draggingRef.current = null;
                          setDraggingId(null);
                          setDropIndex(null);
                        }}
                      >
                        <GripVertical aria-hidden="true" size={15} />
                      </DragHandle>
                      <IconButton
                        aria-label={`Move ${title} up`}
                        disabled={
                          !reorderable || index <= Math.max(currentIndex + 1, 0)
                        }
                        onClick={() =>
                          void move(item.queueId, index - 1, title)
                        }
                      >
                        <ArrowUp aria-hidden="true" size={15} />
                      </IconButton>
                      <IconButton
                        aria-label={`Move ${title} down`}
                        disabled={!reorderable || index + 1 >= ordered.length}
                        onClick={() =>
                          void move(item.queueId, index + 1, title)
                        }
                      >
                        <ArrowDown aria-hidden="true" size={15} />
                      </IconButton>
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
