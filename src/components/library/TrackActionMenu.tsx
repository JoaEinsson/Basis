import type { TrackDto } from "../../lib/types";
import { MenuItem, MenuSurface } from "../ui";

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
  function action(callback: () => void) {
    callback();
    onClose();
  }

  return (
    <MenuSurface
      className="track-context-menu"
      ariaLabel="Track selection actions"
      position={position}
      onClose={onClose}
    >
      {onPlayTrack && (
        <MenuItem onClick={() => action(() => onPlayTrack(track))}>
          Play now
        </MenuItem>
      )}
      {onPlayNext && (
        <MenuItem onClick={() => action(() => onPlayNext(track))}>
          Play next
        </MenuItem>
      )}
      {onAddToQueue && (
        <MenuItem onClick={() => action(() => onAddToQueue(track))}>
          Add to queue
        </MenuItem>
      )}
      {onAddToPlaylist && (
        <MenuItem onClick={() => action(() => onAddToPlaylist(track))}>
          Add to playlist
        </MenuItem>
      )}
      {onFavorite && (
        <MenuItem
          onClick={() => action(() => onFavorite(track, !track.favorite))}
        >
          {track.favorite ? "Remove from Favorites" : "Add to Favorites"}
        </MenuItem>
      )}
      {onSelectOnly && (
        <MenuItem onClick={() => action(() => onSelectOnly(track))}>
          Select only this track
        </MenuItem>
      )}
      {onClearSelection && (
        <MenuItem onClick={() => action(onClearSelection)}>
          Clear selection
        </MenuItem>
      )}
    </MenuSurface>
  );
}
