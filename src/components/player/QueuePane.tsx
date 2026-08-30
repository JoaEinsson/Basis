import { X } from "lucide-react";
import { displayTrackTitle } from "../library/format";
import { usePlayer } from "./PlayerContext";

export function QueuePane() {
  const player = usePlayer();
  const snapshot = player.snapshot;
  if (!player.queueOpen || !snapshot) return null;

  const itemsById = new Map(
    snapshot.queue.map((item) => [item.queueId, item] as const),
  );
  const ordered = snapshot.playOrder.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
  const currentId = snapshot.currentTrack?.queueId;

  return (
    <aside className="queue-pane" aria-label="Playback queue">
      <header>
        <div>
          <h2>Queue</h2>
          <p>{ordered.length} tracks · local session</p>
        </div>
        <button type="button" aria-label="Close queue" onClick={() => player.setQueueOpen(false)}>
          <X aria-hidden="true" size={18} />
        </button>
      </header>
      {ordered.length === 0 ? (
        <div className="quiet-state">
          <p>The queue is empty.</p>
        </div>
      ) : (
        <ol className="queue-items">
          {ordered.map((item) => {
            const title = displayTrackTitle(item.track.title, item.track.relPath);
            return (
              <li key={item.queueId} data-current={item.queueId === currentId || undefined}>
                <span className="queue-position">{ordered.indexOf(item) + 1}</span>
                <span>
                  <strong>{title}</strong>
                  <small>{item.track.artist ?? "Unknown artist"}</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
