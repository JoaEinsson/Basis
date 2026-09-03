import { ArrowLeft, Play, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlbumGrid } from "../components/library/AlbumGrid";
import { TrackList } from "../components/library/TrackList";
import { PlaylistPicker } from "../components/playlists/PlaylistPicker";
import { usePlayer } from "../components/player/PlayerContext";
import { EmptyState, LocalErrorState, Skeleton } from "../components/ui";
import { getArtistDetail, setFavorite } from "../lib/tauri";
import type { ArtistDetailDto, TrackDto } from "../lib/types";

export function ArtistDetail() {
  const { artistKey = "" } = useParams();
  const navigate = useNavigate();
  const player = usePlayer();
  const [detail, setDetail] = useState<ArtistDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackDto[] | null>(null);
  const [libraryRevision, setLibraryRevision] = useState(0);

  useEffect(() => {
    const reload = () => setLibraryRevision((revision) => revision + 1);
    window.addEventListener("basis:library-projection-changed", reload);
    return () =>
      window.removeEventListener("basis:library-projection-changed", reload);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getArtistDetail(artistKey)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Artist could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [artistKey, libraryRevision]);

  if (loading) {
    return (
      <section
        className="page detail-loading-state"
        aria-label="Loading artist"
      >
        <Skeleton label="Loading artist details" />
        <Skeleton label="Loading artist albums" />
        <Skeleton label="Loading artist tracks" />
      </section>
    );
  }
  if (error || detail === null) {
    return (
      <section className="page">
        <LocalErrorState
          title="Artist unavailable"
          onRetry={() => setLibraryRevision((revision) => revision + 1)}
        >
          <p>{error ?? "This artist is no longer in the index."}</p>
        </LocalErrorState>
      </section>
    );
  }

  return (
    <article className="page detail-page">
      <button
        className="back-context"
        type="button"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft aria-hidden="true" size={17} /> Back
      </button>
      <header className="artist-header">
        <p className="page-kicker">Artist</p>
        <h1>{detail.artist.name}</h1>
        <p className="detail-metadata">
          {detail.artist.albumCount} albums · {detail.artist.trackCount} tracks
        </p>
        <div className="detail-actions">
          <button
            className="primary-action"
            type="button"
            disabled={detail.tracks.length === 0}
            onClick={() => void playArtist(detail.tracks[0]?.id)}
          >
            <Play aria-hidden="true" size={17} /> Play
          </button>
          <button
            type="button"
            disabled={detail.tracks.length === 0}
            onClick={() => void playArtist(detail.tracks[0]?.id, true)}
          >
            <Shuffle aria-hidden="true" size={17} /> Shuffle
          </button>
        </div>
      </header>
      {detail.albums.length > 0 && (
        <section className="detail-section" aria-labelledby="artist-albums">
          <h2 id="artist-albums">Albums</h2>
          <AlbumGrid albums={detail.albums} />
        </section>
      )}
      {detail.tracks.length > 0 && (
        <section className="detail-section" aria-labelledby="artist-tracks">
          <h2 id="artist-tracks">Tracks</h2>
          <TrackList
            tracks={detail.tracks}
            playingTrackId={player.snapshot?.currentTrack?.track.id}
            onPlayTrack={(track) => void playArtist(track.id)}
            onPlayNext={(track) =>
              void player.playCollection([track.id], track.id, "next")
            }
            onAddToQueue={(track) =>
              void player.playCollection([track.id], track.id, "append")
            }
            onAddToPlaylist={(track) => setPlaylistTracks([track])}
            onFavorite={(track, value) => void setFavorite(track.id, value)}
          />
        </section>
      )}
      {detail.albums.length === 0 && detail.tracks.length === 0 && (
        <EmptyState title="No indexed music">
          <p>This artist no longer has albums or tracks in the library.</p>
        </EmptyState>
      )}
      {playlistTracks && (
        <PlaylistPicker
          tracks={playlistTracks}
          onClose={() => setPlaylistTracks(null)}
        />
      )}
    </article>
  );

  async function playArtist(startTrackId?: string, shuffle = false) {
    if (!startTrackId) return;
    if (shuffle) await player.setShuffle(true);
    const started = await player.playCollection(
      detail.tracks.map((track) => track.id),
      startTrackId,
    );
    if (started) navigate("/now-playing");
  }
}
