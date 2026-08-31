import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrackList } from "../components/library/TrackList";
import { PlaylistPicker } from "../components/playlists/PlaylistPicker";
import { usePlayer } from "../components/player/PlayerContext";
import { useLibraryContext } from "../components/shell/LibraryContext";
import { executeLibraryQuery, setFavorite } from "../lib/tauri";
import type { QueryItems, TrackDto, ViewDefinition } from "../lib/types";

const HOME_SECTION_IDS = [
  "builtin:recently-added",
  "builtin:recently-played",
  "builtin:favorites",
];

export function Home() {
  const { library, views, chooseLibrary, choosingLibrary } =
    useLibraryContext();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("basis:library-projection-changed", refresh);
    return () =>
      window.removeEventListener("basis:library-projection-changed", refresh);
  }, []);

  if (library === null) {
    return (
      <section className="page quiet-state">
        <p className="page-kicker">Home</p>
        <h1>Your library starts with a folder.</h1>
        <p>Basis indexes music in place and never reorganizes your files.</p>
        <button
          type="button"
          disabled={choosingLibrary}
          onClick={() => void chooseLibrary()}
        >
          {choosingLibrary ? "Opening…" : "Add music folder"}
        </button>
      </section>
    );
  }

  const sections = HOME_SECTION_IDS.map((id) =>
    views.find((view) => view.id === id),
  ).filter((view): view is ViewDefinition => view !== undefined);

  return (
    <section className="page home-page" aria-labelledby="home-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">Library</p>
          <h1 id="home-title">Home</h1>
        </div>
      </div>
      {sections.map((view) => (
        <HomeSection key={view.id} view={view} revision={revision} />
      ))}
    </section>
  );
}

function HomeSection({
  view,
  revision,
}: {
  view: ViewDefinition;
  revision: number;
}) {
  const player = usePlayer();
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<TrackDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackDto[] | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void executeLibraryQuery({
      entity: view.entity,
      query: view.query,
      sort: view.sort,
      page: 0,
      pageSize: 12,
    })
      .then((page) => {
        if (!active) return;
        const items: QueryItems = page.items;
        setTracks(items.kind === "tracks" ? items.items : []);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : `${view.name} could not load.`,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision, view]);

  async function play(track: TrackDto) {
    const started = await player.playCollection(
      tracks.map((item) => item.id),
      track.id,
    );
    if (started) navigate("/now-playing");
  }

  return (
    <section className="home-section" aria-labelledby={`home-${view.id}`}>
      <div className="section-heading">
        <h2 id={`home-${view.id}`}>{view.name}</h2>
        <button
          type="button"
          className="text-action"
          onClick={() => navigate(`/views/${encodeURIComponent(view.id)}`)}
        >
          View all
        </button>
      </div>
      {loading && tracks.length === 0 && (
        <p className="loading-state">Loading {view.name.toLowerCase()}…</p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && tracks.length === 0 && (
        <p className="quiet-inline-state">
          {view.id === "builtin:favorites"
            ? "Favorite tracks appear here."
            : view.id === "builtin:recently-played"
              ? "Listening history appears here."
              : "No indexed tracks yet."}
        </p>
      )}
      {tracks.length > 0 && (
        <TrackList
          tracks={tracks}
          compact
          onPlayTrack={(track) => void play(track)}
          onPlayNext={(track) =>
            void player.playCollection([track.id], track.id, "next")
          }
          onAddToQueue={(track) =>
            void player.playCollection([track.id], track.id, "append")
          }
          onAddToPlaylist={(track) => setPlaylistTracks([track])}
          onFavorite={(track, value) => void setFavorite(track.id, value)}
        />
      )}
      {playlistTracks && (
        <PlaylistPicker
          tracks={playlistTracks}
          onClose={() => setPlaylistTracks(null)}
        />
      )}
    </section>
  );
}
