import { useEffect, useState } from "react";
import { createPlaylist, listPlaylists, updatePlaylist } from "../../lib/tauri";
import type { Playlist, StaticPlaylistItem, TrackDto } from "../../lib/types";

type PlaylistPickerProps = {
  tracks: TrackDto[];
  onClose: () => void;
};

export function PlaylistPicker({ tracks, onClose }: PlaylistPickerProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listPlaylists()
      .then((catalog) => {
        if (active) setPlaylists(catalog.playlists);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Playlists could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function addTo(playlist: Playlist) {
    if (playlist.type !== "static") return;
    setSaving(true);
    setError(null);
    try {
      await updatePlaylist({
        ...playlist,
        items: [...playlist.items, ...tracks.map(itemFromTrack)],
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tracks could not be added to the playlist.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createStatic() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await createPlaylist({
        type: "static",
        name: trimmed,
        items: tracks.map(itemFromTrack),
      });
      onClose();
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

  const staticPlaylists = playlists.filter(
    (playlist) => playlist.type === "static",
  );
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="small-dialog playlist-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-picker-title"
      >
        <h2 id="playlist-picker-title">
          Add {tracks.length === 1 ? "track" : `${tracks.length} tracks`} to
          playlist
        </h2>
        {loading ? (
          <p className="loading-state">Loading playlists…</p>
        ) : (
          <div className="playlist-picker-list">
            {staticPlaylists.map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                disabled={saving}
                onClick={() => void addTo(playlist)}
              >
                <span>{playlist.name}</span>
                <small>{playlist.items.length} tracks</small>
              </button>
            ))}
            {staticPlaylists.length === 0 && (
              <p>No static playlists yet. Create the first one below.</p>
            )}
          </div>
        )}
        <form
          className="playlist-create-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void createStatic();
          }}
        >
          <label>
            New static playlist
            <input
              value={name}
              maxLength={512}
              onChange={(event) => setName(event.target.value)}
              placeholder="Playlist name"
            />
          </label>
          <button type="submit" disabled={saving || !name.trim()}>
            Create and add
          </button>
        </form>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

export function itemFromTrack(track: TrackDto): StaticPlaylistItem {
  return {
    path: track.relPath,
    hint: {
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration_ms: track.durationMs,
      disc_no: track.discNo,
      track_no: track.trackNo,
    },
  };
}
