import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { displayTrackTitle } from "../components/library/format";
import { TrackList } from "../components/library/TrackList";
import {
  itemFromTrack,
  PlaylistPicker,
} from "../components/playlists/PlaylistPicker";
import { usePlayer } from "../components/player/PlayerContext";
import { Dialog, DialogActions, DragHandle, EntityRow } from "../components/ui";
import {
  createPlaylist,
  listPlaylists,
  parseLibraryQuery,
  removePlaylist,
  resolvePlaylist,
  setFavorite,
  updatePlaylist,
} from "../lib/tauri";
import type {
  Playlist,
  QueryField,
  ResolvedPlaylist,
  ResolvedPlaylistItem,
  TrackDto,
} from "../lib/types";

export function Playlists() {
  const { playlistId } = useParams();
  return playlistId ? <PlaylistDetail id={playlistId} /> : <PlaylistIndex />;
}

function PlaylistIndex() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [portableRevision, setPortableRevision] = useState(0);

  useEffect(() => {
    const reload = () => setPortableRevision((revision) => revision + 1);
    window.addEventListener("basis:playlists-changed", reload);
    return () => window.removeEventListener("basis:playlists-changed", reload);
  }, []);

  async function refresh() {
    const catalog = await listPlaylists();
    setPlaylists(catalog.playlists);
    setWarnings(catalog.warnings);
  }

  useEffect(() => {
    let active = true;
    void listPlaylists()
      .then((catalog) => {
        if (!active) return;
        setPlaylists(catalog.playlists);
        setWarnings(catalog.warnings);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Playlists could not load.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [portableRevision]);

  return (
    <section className="page playlists-page" aria-labelledby="playlists-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">Library</p>
          <h1 id="playlists-title">Playlists</h1>
        </div>
        <button type="button" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" size={16} /> New playlist
        </button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <details className="portable-warnings">
          <summary>{warnings.length} unavailable playlist files</summary>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      {loading && <p className="loading-state">Loading playlists…</p>}
      {!loading && playlists.length === 0 && (
        <div className="quiet-state">
          <h2>No playlists yet.</h2>
          <p>Create an ordered static list or a smart metadata query.</p>
        </div>
      )}
      <div className="playlist-index-list">
        {playlists.map((playlist) => (
          <Link key={playlist.id} to={`/playlists/${playlist.id}`}>
            <span>
              <span className="entity-title">{playlist.name}</span>
              <span className="entity-subtitle">
                {playlist.type === "static"
                  ? `${playlist.items.length} tracks`
                  : "Smart playlist"}
              </span>
            </span>
            <span className="entity-subtitle">{playlist.type}</span>
          </Link>
        ))}
      </div>
      {creating && (
        <CreatePlaylistDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refresh();
          }}
        />
      )}
    </section>
  );
}

function CreatePlaylistDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"static" | "smart">("static");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      if (type === "static") {
        await createPlaylist({ type, name: trimmed, items: [] });
      } else {
        await createPlaylist({
          type,
          name: trimmed,
          query: await parseLibraryQuery(query),
          sort: [{ field: "title", direction: "asc" }],
        });
      }
      onCreated();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The playlist could not be created.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      className="small-dialog"
      ariaLabelledBy="new-playlist-title"
      dismissible={!saving}
      onClose={onClose}
    >
      <form
        className="ui-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2 id="new-playlist-title">New playlist</h2>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "static" | "smart")
            }
          >
            <option value="static">Static</option>
            <option value="smart">Smart</option>
          </select>
        </label>
        {type === "smart" && (
          <label>
            Query
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="genre:Country favorite:true"
            />
          </label>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <DialogActions>
          <button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create"}
          </button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function PlaylistDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const player = usePlayer();
  const [resolved, setResolved] = useState<ResolvedPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [portableRevision, setPortableRevision] = useState(0);

  useEffect(() => {
    const reload = () => setPortableRevision((revision) => revision + 1);
    window.addEventListener("basis:playlists-changed", reload);
    return () => window.removeEventListener("basis:playlists-changed", reload);
  }, []);

  async function refresh() {
    const next = await resolvePlaylist(id);
    setResolved(next);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void resolvePlaylist(id)
      .then((next) => {
        if (active) setResolved(next);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Playlist could not load.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, portableRevision]);

  async function savePlaylist(playlist: Playlist) {
    setSaving(true);
    setError(null);
    try {
      await updatePlaylist(playlist);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Playlist could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrent() {
    if (!resolved) return;
    if (!window.confirm(`Delete playlist “${resolved.playlist.name}”?`)) return;
    await removePlaylist(resolved.playlist.id);
    navigate("/playlists", { replace: true });
  }

  async function playAll() {
    if (!resolved) return;
    const tracks = resolved.items.flatMap((item) =>
      item.track ? [item.track] : [],
    );
    if (tracks.length === 0) return;
    const started = await player.playCollection(
      tracks.map((track) => track.id),
      tracks[0].id,
    );
    if (started) navigate("/now-playing");
  }

  if (loading) {
    return <p className="page loading-state">Loading playlist…</p>;
  }
  if (!resolved) {
    return (
      <section className="page quiet-state" role="alert">
        <h1>Playlist unavailable</h1>
        <p>{error ?? "This playlist is missing or invalid."}</p>
      </section>
    );
  }
  const playlist = resolved.playlist;
  return (
    <section className="page playlist-detail" aria-labelledby="playlist-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">{playlist.type} playlist</p>
          <input
            id="playlist-title"
            className="editable-page-title"
            aria-label="Playlist name"
            value={playlist.name}
            onChange={(event) =>
              setResolved({
                ...resolved,
                playlist: { ...playlist, name: event.target.value },
              })
            }
            onBlur={() => void savePlaylist(resolved.playlist)}
          />
        </div>
        <div className="page-actions">
          <button
            type="button"
            disabled={!resolved.items.some((item) => item.track)}
            onClick={() => void playAll()}
          >
            Play
          </button>
          <button
            type="button"
            className="danger-action"
            onClick={() => void deleteCurrent()}
          >
            <Trash2 aria-hidden="true" size={16} /> Delete
          </button>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {playlist.type === "static" ? (
        <StaticPlaylistEditor
          resolved={resolved}
          saving={saving}
          onSave={savePlaylist}
          onPlay={(track) =>
            void player.playCollection(
              resolved.items.flatMap((item) =>
                item.track ? [item.track.id] : [],
              ),
              track.id,
            )
          }
        />
      ) : (
        <>
          <form
            className="smart-playlist-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void parseLibraryQuery(queryText)
                .then((query) => savePlaylist({ ...playlist, query }))
                .catch((cause: unknown) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Query is invalid.",
                  ),
                );
            }}
          >
            <label>
              Replace query
              <input
                value={queryText}
                onChange={(event) => setQueryText(event.target.value)}
                placeholder="artist:Name year:>=2020"
              />
            </label>
            <label>
              Sort
              <select
                value={playlist.sort[0]?.field ?? "title"}
                onChange={(event) =>
                  void savePlaylist({
                    ...playlist,
                    sort: [
                      {
                        field: event.target.value as QueryField,
                        direction: playlist.sort[0]?.direction ?? "asc",
                      },
                    ],
                  })
                }
              >
                <option value="title">title</option>
                <option value="artist">artist</option>
                <option value="album">album</option>
                <option value="lastPlayed">last played</option>
                <option value="playCount">play count</option>
              </select>
            </label>
            <button type="submit" disabled={saving || !queryText.trim()}>
              Apply query
            </button>
          </form>
          <SmartPlaylistTracks
            items={resolved.items}
            onPlay={(track) =>
              void player.playCollection(
                resolved.items.flatMap((item) =>
                  item.track ? [item.track.id] : [],
                ),
                track.id,
              )
            }
          />
        </>
      )}
    </section>
  );
}

export function StaticPlaylistEditor({
  resolved,
  saving,
  onSave,
  onPlay,
}: {
  resolved: ResolvedPlaylist;
  saving: boolean;
  onSave: (playlist: Playlist) => Promise<void>;
  onPlay: (track: TrackDto) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const playlist = resolved.playlist;
  if (playlist.type !== "static") return null;
  const virtualizer = useVirtualizer({
    count: resolved.items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 62,
    overscan: 10,
  });

  function reorder(from: number, to: number) {
    if (from === to || to < 0 || to >= playlist.items.length) return;
    void onSave({
      ...playlist,
      items: reorderPlaylistItems(playlist.items, from, to),
    });
  }

  function addDroppedTrack(event: React.DragEvent) {
    event.preventDefault();
    const source = event.dataTransfer.getData("application/x-basis-track");
    if (!source) return;
    try {
      const track = JSON.parse(source) as Partial<TrackDto>;
      if (typeof track.id !== "string" || typeof track.relPath !== "string")
        return;
      void onSave({
        ...playlist,
        items: [...playlist.items, itemFromTrack(track as TrackDto)],
      });
    } catch {
      return;
    }
  }

  return (
    <>
      <p className="playlist-drop-hint">
        Use the drag handle to reorder. Add tracks from a track action menu.
      </p>
      <div
        className="playlist-track-viewport"
        ref={scrollRef}
        onDragOver={(event) => event.preventDefault()}
        onDrop={addDroppedTrack}
      >
        <div
          className="playlist-track-virtual"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((row) => {
            const resolvedItem = resolved.items[row.index];
            const presentation = staticPlaylistItemPresentation(resolvedItem);
            return (
              <EntityRow
                className="playlist-track-row"
                key={`${resolvedItem.item.path}:${row.index}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  const sourceIndex =
                    dragIndexRef.current ??
                    readPlaylistDragIndex(event.dataTransfer);
                  event.dataTransfer.dropEffect =
                    sourceIndex === null ? "copy" : "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const sourceIndex =
                    readPlaylistDragIndex(event.dataTransfer) ??
                    dragIndexRef.current;
                  if (sourceIndex !== null) {
                    reorder(sourceIndex, row.index);
                    dragIndexRef.current = null;
                  } else {
                    addDroppedTrack(event);
                  }
                }}
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <DragHandle
                  className="playlist-drag-handle"
                  draggable={!saving}
                  aria-label={`Drag ${presentation.title} to reorder`}
                  disabled={saving}
                  onDragStart={(event) => {
                    dragIndexRef.current = row.index;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      "application/x-basis-playlist-index",
                      String(row.index),
                    );
                    event.dataTransfer.setData(
                      "text/plain",
                      presentation.title,
                    );
                  }}
                  onDragEnd={() => {
                    dragIndexRef.current = null;
                  }}
                >
                  <GripVertical aria-hidden="true" size={16} />
                </DragHandle>
                <button
                  type="button"
                  className="playlist-track-main"
                  disabled={!resolvedItem.track}
                  onClick={() =>
                    resolvedItem.track && onPlay(resolvedItem.track)
                  }
                >
                  <span className="entity-title">{presentation.title}</span>
                  <span className="entity-subtitle">
                    {presentation.subtitle}
                  </span>
                </button>
                {!resolvedItem.track && resolvedItem.suggested_path && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Relink “${resolvedItem.item.path}” to “${resolvedItem.suggested_path}”?`,
                        )
                      )
                        return;
                      const items = [...playlist.items];
                      items[row.index] = {
                        ...items[row.index],
                        path: resolvedItem.suggested_path,
                      };
                      void onSave({ ...playlist, items });
                    }}
                  >
                    Relink
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={row.index === 0 || saving}
                  onClick={() => reorder(row.index, row.index - 1)}
                >
                  <ArrowUp aria-hidden="true" size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={row.index + 1 === playlist.items.length || saving}
                  onClick={() => reorder(row.index, row.index + 1)}
                >
                  <ArrowDown aria-hidden="true" size={15} />
                </button>
                <button
                  type="button"
                  aria-label="Remove from playlist"
                  disabled={saving}
                  onClick={() =>
                    void onSave({
                      ...playlist,
                      items: playlist.items.filter(
                        (_, index) => index !== row.index,
                      ),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </EntityRow>
            );
          })}
        </div>
      </div>
      {playlist.items.length === 0 && (
        <div className="quiet-state">
          <h2>This playlist is empty.</h2>
          <p>Add tracks from a track context menu or drag them here.</p>
        </div>
      )}
    </>
  );
}

export function staticPlaylistItemPresentation(
  resolvedItem: ResolvedPlaylistItem,
): { title: string; subtitle: string } {
  if (resolvedItem.track) {
    return {
      title: displayTrackTitle(
        resolvedItem.track.title,
        resolvedItem.track.relPath,
      ),
      subtitle: resolvedItem.track.artist ?? "Unknown artist",
    };
  }

  return {
    title: resolvedItem.item.hint.title?.trim() || "Missing track",
    subtitle: resolvedItem.item.hint.artist?.trim() || resolvedItem.item.path,
  };
}

export function reorderPlaylistItems<T>(items: T[], from: number, to: number) {
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered;
}

export function readPlaylistDragIndex(
  dataTransfer: Pick<DataTransfer, "getData">,
): number | null {
  const source = dataTransfer.getData("application/x-basis-playlist-index");
  if (!/^\d+$/.test(source)) return null;
  const index = Number(source);
  return Number.isSafeInteger(index) ? index : null;
}

function SmartPlaylistTracks({
  items,
  onPlay,
}: {
  items: ResolvedPlaylistItem[];
  onPlay: (track: TrackDto) => void;
}) {
  const player = usePlayer();
  const [playlistTracks, setPlaylistTracks] = useState<TrackDto[] | null>(null);
  const tracks = items.flatMap((item) => (item.track ? [item.track] : []));
  if (tracks.length === 0) {
    return (
      <div className="quiet-state">
        <h2>No matches.</h2>
        <p>This smart playlist does not match any indexed tracks.</p>
      </div>
    );
  }
  return (
    <>
      <TrackList
        tracks={tracks}
        onPlayTrack={onPlay}
        onPlayNext={(track) =>
          void player.playCollection([track.id], track.id, "next")
        }
        onAddToQueue={(track) =>
          void player.playCollection([track.id], track.id, "append")
        }
        onAddToPlaylist={(track) => setPlaylistTracks([track])}
        onFavorite={(track, value) => void setFavorite(track.id, value)}
      />
      {playlistTracks && (
        <PlaylistPicker
          tracks={playlistTracks}
          onClose={() => setPlaylistTracks(null)}
        />
      )}
    </>
  );
}
