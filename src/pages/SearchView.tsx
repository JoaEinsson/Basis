import { Folder, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlbumGrid } from "../components/library/AlbumGrid";
import { ArtistGrid } from "../components/library/ArtistGrid";
import { TrackList } from "../components/library/TrackList";
import { usePlayer } from "../components/player/PlayerContext";
import { useLibraryContext } from "../components/shell/LibraryContext";
import { searchLibrary } from "../lib/tauri";
import type { GlobalSearchResults } from "../lib/types";

export function SearchView() {
  const navigate = useNavigate();
  const player = usePlayer();
  const [params] = useSearchParams();
  const { library } = useLibraryContext();
  const query = params.get("q") ?? "";
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim() || library === null) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void searchLibrary({ input: query, limitPerSection: 40 })
        .then((next) => {
          if (active) setResults(next);
        })
        .catch((cause: unknown) => {
          if (active) {
            setResults(null);
            setError(cause instanceof Error ? cause.message : "Search failed.");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [library, query]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (query) navigate("/search", { replace: true });
      else navigate(-1);
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [navigate, query]);

  const empty = results !== null && resultCount(results) === 0;

  return (
    <section className="page search-view" aria-labelledby="search-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">Library</p>
          <h1 id="search-title">Search</h1>
        </div>
        {query && <span className="result-query">{query}</span>}
      </div>

      {library === null && (
        <div className="quiet-state">
          <h2>No music folder added.</h2>
          <p>Add a folder before searching your library.</p>
        </div>
      )}
      {library !== null && !query && (
        <div className="quiet-state search-prompt">
          <Search aria-hidden="true" size={22} />
          <h2>Search your library</h2>
          <p>
            Find artists, albums, tracks, genres, folders, and technical
            metadata.
          </p>
        </div>
      )}
      {loading && <p className="loading-state">Searching…</p>}
      {error && (
        <div className="quiet-state" role="alert">
          <h2>Search could not be completed</h2>
          <p className="inline-error">{error}</p>
        </div>
      )}
      {empty && (
        <div className="quiet-state">
          <h2>No results for “{query}”</h2>
          <p>Try another name, field, or structured filter.</p>
        </div>
      )}
      {results && !empty && (
        <div className="search-sections">
          {results.artists.length > 0 && (
            <ResultSection title="Artists">
              <ArtistGrid artists={results.artists} />
            </ResultSection>
          )}
          {results.albums.length > 0 && (
            <ResultSection title="Albums">
              <AlbumGrid albums={results.albums} />
            </ResultSection>
          )}
          {results.tracks.length > 0 && (
            <ResultSection title="Tracks">
              <TrackList
                tracks={results.tracks}
                onPlayTrack={(track) => void playSearchResults(track.id)}
                onPlayNext={(track) => void player.playCollection([track.id], track.id, "next")}
                onAddToQueue={(track) => void player.playCollection([track.id], track.id, "append")}
              />
            </ResultSection>
          )}
          {results.genres.length > 0 && (
            <ResultSection title="Genres">
              <div className="facet-list">
                {results.genres.map((genre) => (
                  <span className="facet-entity" key={genre.name}>
                    {genre.name}
                    <small>{genre.trackCount} tracks</small>
                  </span>
                ))}
              </div>
            </ResultSection>
          )}
          {results.folders.length > 0 && (
            <ResultSection title="Folders">
              <div className="entity-list">
                {results.folders.map((folder) => (
                  <div className="list-entity" key={folder.path}>
                    <Folder aria-hidden="true" size={17} />
                    <span>
                      <span className="entity-title">{folder.name}</span>
                      <span className="entity-subtitle">
                        {folder.path} · {folder.trackCount} tracks
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </ResultSection>
          )}
          {results.views.length > 0 && (
            <ResultSection title="Views">
              <div className="entity-list">
                {results.views.map((view) => (
                  <Link
                    className="list-entity"
                    key={view.id}
                    to={`/views/${encodeURIComponent(view.id)}`}
                  >
                    <span className="entity-title">{view.name}</span>
                    <span className="entity-subtitle">View</span>
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}
        </div>
      )}
    </section>
  );

  async function playSearchResults(startTrackId: string) {
    if (!results) return;
    const started = await player.playCollection(
      results.tracks.map((track) => track.id),
      startTrackId,
    );
    if (started) navigate("/now-playing");
  }
}

function ResultSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="result-section" aria-labelledby={`result-${title}`}>
      <h2 id={`result-${title}`}>{title}</h2>
      {children}
    </section>
  );
}

function resultCount(results: GlobalSearchResults) {
  return (
    results.artists.length +
    results.albums.length +
    results.tracks.length +
    results.folders.length +
    results.genres.length +
    results.playlists.length +
    results.views.length
  );
}
