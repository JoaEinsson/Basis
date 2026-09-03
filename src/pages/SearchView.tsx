import { Folder, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { AlbumGrid } from "../components/library/AlbumGrid";
import { ArtistGrid } from "../components/library/ArtistGrid";
import { TrackList } from "../components/library/TrackList";
import { PlaylistPicker } from "../components/playlists/PlaylistPicker";
import { usePlayer } from "../components/player/PlayerContext";
import { useLibraryContext } from "../components/shell/LibraryContext";
import {
  Badge,
  EmptyState,
  InlineStatus,
  LocalErrorState,
  Skeleton,
} from "../components/ui";
import { searchLibrary, setFavorite } from "../lib/tauri";
import type { GlobalSearchResults, TrackDto } from "../lib/types";
import { useNavigationStore } from "../stores/navigation";

const EMPTY_SELECTION: string[] = [];

export function SearchView() {
  const navigate = useNavigate();
  const location = useLocation();
  const player = usePlayer();
  const [params] = useSearchParams();
  const { library } = useLibraryContext();
  const query = params.get("q") ?? "";
  const [results, setResults] = useState<GlobalSearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{
    message: string;
    parse: boolean;
  } | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackDto[] | null>(null);
  const selectedTrackIds = useNavigationStore(
    (state) => state.searchSelections[location.key] ?? EMPTY_SELECTION,
  );
  const saveSearchSelection = useNavigationStore(
    (state) => state.saveSearchSelection,
  );

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
      void runSearch();
    }, 160);

    async function runSearch() {
      try {
        const next = await searchLibrary({
          input: query,
          limitPerSection: 40,
        });
        if (active) setResults(next);
      } catch (cause) {
        if (!active) return;
        setResults(null);
        const message =
          cause instanceof Error ? cause.message : "Search failed.";
        setError({ message, parse: isParseError(message) });
      } finally {
        if (active) setLoading(false);
      }
    }
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
        {query && <Badge tone="accent">{query}</Badge>}
      </div>

      {library === null && (
        <EmptyState title="No music folder added">
          Add a folder before searching your library.
        </EmptyState>
      )}
      {library !== null && !query && (
        <EmptyState className="search-prompt" title="Search your library">
          <Search aria-hidden="true" size={22} />
          <p>
            Find artists, albums, tracks, genres, folders, and technical
            metadata.
          </p>
        </EmptyState>
      )}
      {loading && !results && <SearchLoading />}
      {loading && results && (
        <InlineStatus>Updating grouped results…</InlineStatus>
      )}
      {error && (
        <LocalErrorState
          title={error.parse ? "Search query is not valid" : "Search failed"}
        >
          {error.message}
        </LocalErrorState>
      )}
      {empty && (
        <EmptyState title={`No results for “${query}”`}>
          Try another name, field, or structured filter.
        </EmptyState>
      )}
      {results && !empty && (
        <div className="search-sections">
          {results.artists.length > 0 && (
            <ResultSection title="Artists" count={results.artists.length}>
              <ArtistGrid artists={results.artists} />
            </ResultSection>
          )}
          {results.albums.length > 0 && (
            <ResultSection title="Albums" count={results.albums.length}>
              <AlbumGrid albums={results.albums} />
            </ResultSection>
          )}
          {results.tracks.length > 0 && (
            <ResultSection title="Tracks" count={results.tracks.length}>
              <TrackList
                tracks={results.tracks}
                playingTrackId={player.snapshot?.currentTrack?.track.id}
                selectedIds={selectedTrackIds}
                onSelectionChange={(ids) =>
                  saveSearchSelection(location.key, ids)
                }
                onPlayTrack={(track) => void playSearchResults(track.id)}
                onPlayNext={(track) =>
                  void player.playCollection([track.id], track.id, "next")
                }
                onAddToQueue={(track) =>
                  void player.playCollection([track.id], track.id, "append")
                }
                onAddToPlaylist={(track) => setPlaylistTracks([track])}
                onFavorite={(track, value) => void setFavorite(track.id, value)}
              />
            </ResultSection>
          )}
          {results.genres.length > 0 && (
            <ResultSection title="Genres" count={results.genres.length}>
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
            <ResultSection title="Folders" count={results.folders.length}>
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
            <ResultSection title="Views" count={results.views.length}>
              <div className="entity-list">
                {results.views.map((view) => (
                  <Link
                    className="list-entity"
                    key={view.id}
                    to={
                      view.id === "builtin:home"
                        ? "/home"
                        : `/views/${encodeURIComponent(view.id)}`
                    }
                  >
                    <span className="entity-title">{view.name}</span>
                    <span className="entity-subtitle">View</span>
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}
          {results.playlists.length > 0 && (
            <ResultSection title="Playlists" count={results.playlists.length}>
              <div className="entity-list">
                {results.playlists.map((playlist) => (
                  <Link
                    className="list-entity"
                    key={playlist.id}
                    to={`/playlists/${playlist.id}`}
                  >
                    <span className="entity-title">{playlist.name}</span>
                    <span className="entity-subtitle">Playlist</span>
                  </Link>
                ))}
              </div>
            </ResultSection>
          )}
        </div>
      )}
      {playlistTracks && (
        <PlaylistPicker
          tracks={playlistTracks}
          onClose={() => setPlaylistTracks(null)}
        />
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
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="result-section" aria-labelledby={`result-${title}`}>
      <div className="result-section-heading">
        <h2 id={`result-${title}`}>{title}</h2>
        <Badge>{count}</Badge>
      </div>
      {children}
    </section>
  );
}

function SearchLoading() {
  return (
    <div className="search-loading" aria-label="Searching library">
      <Skeleton label="Loading search results" />
      <Skeleton label="Loading more search results" />
      <Skeleton label="Loading more search results" />
    </div>
  );
}

function isParseError(message: string) {
  return /field|operator|parse|query|syntax|unexpected/i.test(message);
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
