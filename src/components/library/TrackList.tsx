import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import type { QueryField, TrackDto } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import { displayTrackTitle, formatDuration } from "./format";

type TrackListProps = {
  tracks: TrackDto[];
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  compact?: boolean;
  visibleFields?: QueryField[];
  onPlayTrack?: (track: TrackDto) => void;
  onPlayNext?: (track: TrackDto) => void;
  onAddToQueue?: (track: TrackDto) => void;
};

export function TrackList({
  tracks,
  selectedIds = [],
  onSelectionChange,
  compact = false,
  visibleFields = ["title", "artist", "album", "duration"],
  onPlayTrack,
  onPlayNext,
  onAddToQueue,
}: TrackListProps) {
  const { tokens } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    trackId: string;
    x: number;
    y: number;
  } | null>(null);
  const comfortableHeight =
    numberToken(tokens["density.trackRowHeight"], 54) *
    numberToken(tokens["density.scale"], 1);
  const rowHeight = compact
    ? Math.max(28, comfortableHeight * 0.78)
    : comfortableHeight;
  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });
  const selected = new Set(selectedIds);

  useEffect(() => {
    if (contextMenu === null) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

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
            <button
              className="track-row"
              data-selected={isSelected || undefined}
              key={track.id}
              role="option"
              aria-selected={isSelected}
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
              onContextMenu={(event) => {
                if (
                  !onSelectionChange &&
                  !onPlayTrack &&
                  !onPlayNext &&
                  !onAddToQueue
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
              type="button"
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
          );
        })}
      </div>
      {contextMenu && (
        <div
          className="track-context-menu"
          role="menu"
          aria-label="Track selection actions"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {onPlayTrack && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                const track = tracks.find(
                  (candidate) => candidate.id === contextMenu.trackId,
                );
                if (track) onPlayTrack(track);
                setContextMenu(null);
              }}
            >
              Play now
            </button>
          )}
          {onPlayNext && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                const track = tracks.find(
                  (candidate) => candidate.id === contextMenu.trackId,
                );
                if (track) onPlayNext(track);
                setContextMenu(null);
              }}
            >
              Play next
            </button>
          )}
          {onAddToQueue && (
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                const track = tracks.find(
                  (candidate) => candidate.id === contextMenu.trackId,
                );
                if (track) onAddToQueue(track);
                setContextMenu(null);
              }}
            >
              Add to queue
            </button>
          )}
          {onSelectionChange && (
            <>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onSelectionChange([contextMenu.trackId]);
                  setContextMenu(null);
                }}
              >
                Select only this track
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  onSelectionChange([]);
                  setContextMenu(null);
                }}
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function numberToken(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
