import { useEffect } from "react";
import type { TrackDto } from "../../lib/types";

export type TrackActionMenuPosition = {
  x: number;
  y: number;
};

type TrackActionMenuProps = {
  track: TrackDto;
  position: TrackActionMenuPosition;
  onClose: () => void;
  onPlayTrack?: (track: TrackDto) => void;
  onPlayNext?: (track: TrackDto) => void;
  onAddToQueue?: (track: TrackDto) => void;
  onAddToPlaylist?: (track: TrackDto) => void;
  onFavorite?: (track: TrackDto, value: boolean) => void;
  onSelectOnly?: (track: TrackDto) => void;
  onClearSelection?: () => void;
};

export function TrackActionMenu({
  track,
  position,
  onClose,
  onPlayTrack,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onFavorite,
  onSelectOnly,
  onClearSelection,
}: TrackActionMenuProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onClose);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", onClose);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  function action(callback: () => void) {
    callback();
    onClose();
  }

  return (
    <div
      className="track-context-menu"
      role="menu"
      aria-label="Track selection actions"
      style={{ left: position.x, top: position.y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {onPlayTrack && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(() => onPlayTrack(track))}
        >
          Play now
        </button>
      )}
      {onPlayNext && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(() => onPlayNext(track))}
        >
          Play next
        </button>
      )}
      {onAddToQueue && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(() => onAddToQueue(track))}
        >
          Add to queue
        </button>
      )}
      {onAddToPlaylist && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(() => onAddToPlaylist(track))}
        >
          Add to playlist
        </button>
      )}
      {onFavorite && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(() => onFavorite(track, !track.favorite))}
        >
          {track.favorite ? "Remove from Favorites" : "Add to Favorites"}
        </button>
      )}
      {onSelectOnly && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(() => onSelectOnly(track))}
        >
          Select only this track
        </button>
      )}
      {onClearSelection && (
        <button
          role="menuitem"
          type="button"
          onClick={() => action(onClearSelection)}
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
