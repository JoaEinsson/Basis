import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ArtworkPlaceholder } from "../components/library/ArtworkPlaceholder";
import { displayTrackTitle } from "../components/library/format";
import { usePlayer } from "../components/player/PlayerContext";

export function NowPlaying() {
  const navigate = useNavigate();
  const { snapshot } = usePlayer();
  const track = snapshot?.currentTrack?.track;

  if (!snapshot || !track) {
    return (
      <section className="page quiet-state">
        <h1>Nothing playing</h1>
        <p>Start a track from an album, search result, or View.</p>
        <button type="button" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden="true" size={17} /> Back
        </button>
      </section>
    );
  }

  const title = displayTrackTitle(track.title, track.relPath);
  return (
    <article className="page now-playing-view">
      <button className="back-context" type="button" onClick={() => navigate(-1)}>
        <ArrowLeft aria-hidden="true" size={17} /> Back
      </button>
      <div className="now-playing-layout">
        <section className="now-playing-track" aria-labelledby="now-playing-title">
          <ArtworkPlaceholder
            className="now-playing-artwork"
            title={title}
            artworkKey={track.artworkKey}
            seed={track.relPath}
          />
          <div className="now-playing-metadata">
            <h1 id="now-playing-title">{title}</h1>
            <p>{track.artist ?? "Unknown artist"}</p>
            <p>{track.album ?? "Unknown album"}</p>
            {snapshot.outputDevice && <small>{snapshot.outputDevice}</small>}
          </div>
        </section>
        <section className="lyrics-pane" aria-labelledby="lyrics-title">
          <h2 id="lyrics-title">Lyrics</h2>
          <div className="lyrics-unavailable">
            <p>Lyrics unavailable</p>
          </div>
        </section>
      </div>
    </article>
  );
}
