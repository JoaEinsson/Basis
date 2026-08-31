import { useVirtualizer } from "@tanstack/react-virtual";
import { MoreHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import type { QueryField, TrackDto, ViewDensity } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import { resolvedTrackRowHeight } from "../../theme/cssVariables";
import { displayTrackTitle, formatDuration } from "./format";
import { TrackActionMenu } from "./TrackActionMenu";

type TrackListProps = {
  tracks: TrackDto[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  density?: ViewDensity;
  layout?: "list" | "table";
  visibleFields?: QueryField[];
  onPlayTrack?: (track: TrackDto) => void;
  onPlayNext?: (track: TrackDto) => void;
  onAddToQueue?: (track: TrackDto) => void;
  onAddToPlaylist?: (track: TrackDto) => void;
  onFavorite?: (track: TrackDto, value: boolean) => void;
};

export function TrackList({
  tracks,
  selectedIds = [],
  onSelectionChange,
  density = "comfortable",
  layout = "table",
  visibleFields = ["title", "artist", "album", "duration"],
  onPlayTrack,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onFavorite,
}: TrackListProps) {
  const { tokens } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    trackId: string;
    x: number;
    y: number;
  } | null>(null);
  const rowHeight = resolvedTrackRowHeight(tokens, density);
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });
  const selected = new Set(selectedIds);

  function toggleSelection(id: string, additive: boolean) {
    if (!onSelectionChange) {
      return;
    }
    if (!additive) {
      onSelectionChange(selected.has(id) && selected.size === 1 ? [] : [id]);
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange([...next]);
  }

  return (
    <div
      className="track-list-viewport"
      ref={scrollRef}
      role="listbox"
      aria-multiselectable={Boolean(onSelectionChange)}
      aria-label="Tracks"
    >
      <div
        className="track-list-virtual"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const track = tracks[virtualRow.index];
          const isSelected = selected.has(track.id);
          return (
            <div
              className="track-row"
              data-selected={isSelected || undefined}
              key={track.id}
              role="option"
              aria-selected={isSelected}
              onContextMenu={(event) => {
                if (
                  !onSelectionChange &&
                  !onPlayTrack &&
                  !onPlayNext &&
                  !onAddToQueue &&
                  !onAddToPlaylist &&
                  !onFavorite
                ) {
                  return;
                }
                event.preventDefault();
                if (onSelectionChange && !selected.has(track.id)) {
                  onSelectionChange([track.id]);
                }
                setContextMenu({
                  trackId: track.id,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                className="track-row-main"
                type="button"
                data-layout={layout}
                draggable={Boolean(onAddToPlaylist)}
                onDragStart={(event) => {
                  if (!onAddToPlaylist) return;
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData(
                    "application/x-basis-track",
                    JSON.stringify(track),
                  );
                  event.dataTransfer.setData("text/plain", track.relPath);
                }}
                onClick={(event) => {
                  if (onSelectionChange) {
                    toggleSelection(track.id, event.ctrlKey || event.metaKey);
                  } else {
                    onPlayTrack?.(track);
                  }
                }}
                onDoubleClick={() => {
                  if (onSelectionChange) onPlayTrack?.(track);
                }}
              >
                <span className="track-index">{virtualRow.index + 1}</span>
                <span className="track-primary">
                  <span className="entity-title">
                    {displayTrackTitle(track.title, track.relPath)}
                  </span>
                  {visibleFields.includes("artist") && (
                    <span className="entity-subtitle">
                      {track.artist ?? "Unknown artist"}
                    </span>
                  )}
                </span>
                {visibleFields.includes("album") && (
                  <span className="track-album">
                    {track.album ?? "Unknown album"}
                  </span>
                )}
                {visibleFields.includes("duration") && (
                  <span className="track-duration">
                    {formatDuration(track.durationMs)}
                  </span>
                )}
              </button>
              {(onPlayTrack ||
                onPlayNext ||
                onAddToQueue ||
                onAddToPlaylist ||
                onFavorite) && (
                <button
                  className="track-row-actions"
                  type="button"
                  aria-label={`Actions for ${displayTrackTitle(track.title, track.relPath)}`}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      trackId: track.id,
                      x: Math.max(bounds.left, bounds.right - 192),
                      y: bounds.bottom,
                    });
                  }}
                >
                  <MoreHorizontal aria-hidden="true" size={17} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {contextMenu && (
        <ResolvedTrackActionMenu
          tracks={tracks}
          contextMenu={contextMenu}
          onClose={() => setContextMenu(null)}
          onPlayTrack={onPlayTrack}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
          onFavorite={onFavorite}
          onSelectionChange={onSelectionChange}
        />
      )}
    </div>
  );
}

function ResolvedTrackActionMenu({
  tracks,
  contextMenu,
  onClose,
  onPlayTrack,
  onPlayNext,
  onAddToQueue,
  onAddToPlaylist,
  onFavorite,
  onSelectionChange,
}: Pick<
  TrackListProps,
  | "tracks"
  | "onPlayTrack"
  | "onPlayNext"
  | "onAddToQueue"
  | "onAddToPlaylist"
  | "onFavorite"
  | "onSelectionChange"
> & {
  contextMenu: { trackId: string; x: number; y: number };
  onClose: () => void;
}) {
  const track = tracks.find(
    (candidate) => candidate.id === contextMenu.trackId,
  );
  if (!track) return null;
  return (
    <TrackActionMenu
      track={track}
      position={contextMenu}
      onClose={onClose}
      onPlayTrack={onPlayTrack}
      onPlayNext={onPlayNext}
      onAddToQueue={onAddToQueue}
      onAddToPlaylist={onAddToPlaylist}
      onFavorite={onFavorite}
      onSelectOnly={
        onSelectionChange
          ? (selectedTrack) => onSelectionChange([selectedTrack.id])
          : undefined
      }
      onClearSelection={
        onSelectionChange ? () => onSelectionChange([]) : undefined
      }
    />
  );
}
