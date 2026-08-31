import { ArrowLeft, Play, Shuffle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArtworkPlaceholder } from "../components/library/ArtworkPlaceholder";
import { formatDuration } from "../components/library/format";
import { TrackList } from "../components/library/TrackList";
import { usePlayer } from "../components/player/PlayerContext";
import { getAlbumDetail } from "../lib/tauri";
import type { AlbumDetailDto } from "../lib/types";

export function AlbumDetail() {
  const { albumKey = "" } = useParams();
  const navigate = useNavigate();
  const player = usePlayer();
  const [detail, setDetail] = useState<AlbumDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getAlbumDetail(albumKey)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Album could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [albumKey]);

  if (loading) {
    return (
      <section className="page">
        <p className="loading-state">Loading album…</p>
      </section>
    );
  }
  if (error || detail === null) {
    return (
      <section className="page quiet-state" role="alert">
        <h1>Album unavailable</h1>
        <p className="inline-error">
          {error ?? "This album is no longer in the index."}
        </p>
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
      <header className="album-header">
        <ArtworkPlaceholder
          className="detail-artwork"
          title={detail.album.title}
          artworkKey={detail.album.artworkKey}
          seed={detail.album.albumKey}
        />
        <div>
          <p className="page-kicker">Album</p>
          <h1>{detail.album.title}</h1>
          <p className="detail-artist">{detail.album.albumArtist}</p>
          <p className="detail-metadata">
            {[
              detail.album.year,
              `${detail.album.trackCount} tracks`,
              formatDuration(detail.album.durationMs),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="detail-actions">
            <button
              className="primary-action"
              type="button"
              disabled={detail.tracks.length === 0}
              onClick={() => void startAlbum(detail.tracks[0]?.id)}
            >
              <Play aria-hidden="true" size={17} /> Play
            </button>
            <button
              type="button"
              disabled={detail.tracks.length === 0}
              onClick={() => void startAlbum(detail.tracks[0]?.id, true)}
            >
              <Shuffle aria-hidden="true" size={17} /> Shuffle
            </button>
          </div>
          {player.error && (
            <p className="inline-error" role="status">
              {player.error}
            </p>
          )}
        </div>
      </header>
      <section className="detail-section" aria-labelledby="album-tracks">
        <h2 id="album-tracks">Tracks</h2>
        <TrackList
          tracks={detail.tracks}
          onPlayTrack={(track) => void startAlbum(track.id)}
          onPlayNext={(track) =>
            void player.playCollection([track.id], track.id, "next")
          }
          onAddToQueue={(track) =>
            void player.playCollection([track.id], track.id, "append")
          }
        />
      </section>
    </article>
  );

  async function startAlbum(startTrackId?: string, shuffle = false) {
    if (!startTrackId) return;
    if (shuffle) await player.setShuffle(true);
    const started = await player.playCollection(
      detail.tracks.map((track) => track.id),
      startTrackId,
      "replace",
    );
    if (started) navigate("/now-playing");
  }
}
