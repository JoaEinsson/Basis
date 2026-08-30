import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlbumGrid } from "../components/library/AlbumGrid";
import { TrackList } from "../components/library/TrackList";
import { usePlayer } from "../components/player/PlayerContext";
import { getArtistDetail } from "../lib/tauri";
import type { ArtistDetailDto } from "../lib/types";

export function ArtistDetail() {
  const { artistKey = "" } = useParams();
  const navigate = useNavigate();
  const player = usePlayer();
  const [detail, setDetail] = useState<ArtistDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
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
  }, [artistKey]);

  if (loading) {
    return (
      <section className="page">
        <p className="loading-state">Loading artist…</p>
      </section>
    );
  }
  if (error || detail === null) {
    return (
      <section className="page quiet-state" role="alert">
        <h1>Artist unavailable</h1>
        <p className="inline-error">
          {error ?? "This artist is no longer in the index."}
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
      <header className="artist-header">
        <p className="page-kicker">Artist</p>
        <h1>{detail.artist.name}</h1>
        <p className="detail-metadata">
          {detail.artist.albumCount} albums · {detail.artist.trackCount} tracks
        </p>
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
            onPlayTrack={(track) => void playArtist(track.id)}
            onPlayNext={(track) => void player.playCollection([track.id], track.id, "next")}
            onAddToQueue={(track) => void player.playCollection([track.id], track.id, "append")}
          />
        </section>
      )}
    </article>
  );

  async function playArtist(startTrackId: string) {
    const started = await player.playCollection(
      detail.tracks.map((track) => track.id),
      startTrackId,
    );
    if (started) navigate("/now-playing");
  }
}
