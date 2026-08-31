import {
  Columns3,
  Grid2X2,
  List,
  Plus,
  Save,
  TableProperties,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArtworkPlaceholder } from "../components/library/ArtworkPlaceholder";
import { displayTrackTitle } from "../components/library/format";
import { AlbumGrid } from "../components/library/AlbumGrid";
import { ArtistGrid } from "../components/library/ArtistGrid";
import { TrackList } from "../components/library/TrackList";
import { PlaylistPicker } from "../components/playlists/PlaylistPicker";
import {
  duplicateView,
  executeLibraryQuery,
  parseLibraryQuery,
  saveView,
  setFavorite,
} from "../lib/tauri";
import type {
  AlbumDto,
  Expr,
  QueryField,
  QueryItems,
  QuerySort,
  TrackDto,
  ViewDefinition,
} from "../lib/types";
import { useNavigationStore, type ViewEntryState } from "../stores/navigation";
import { useLibraryContext } from "../components/shell/LibraryContext";
import { usePlayer } from "../components/player/PlayerContext";

const FILTER_FIELDS: QueryField[] = [
  "title",
  "artist",
  "album",
  "albumArtist",
  "genre",
  "composer",
  "year",
  "codec",
  "path",
  "favorite",
];
const VISIBLE_TRACK_FIELDS: QueryField[] = [
  "title",
  "artist",
  "album",
  "year",
  "genre",
  "duration",
  "codec",
];

export function GenericView() {
  const { viewId = "" } = useParams();
  const decodedViewId = decodeURIComponent(viewId);
  const location = useLocation();
  const { library, views, refreshViews } = useLibraryContext();
  const view = views.find((candidate) => candidate.id === decodedViewId);
  const storedEntry = useNavigationStore(
    (state) => state.viewEntries[location.key],
  );
  const setViewEntry = useNavigationStore((state) => state.setViewEntry);
  const entry = useMemo(
    () => (view ? (storedEntry ?? entryFromView(view)) : null),
    [storedEntry, view],
  );
  const [items, setItems] = useState<QueryItems | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterField, setFilterField] = useState<QueryField>("artist");
  const [filterValue, setFilterValue] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [projectionRevision, setProjectionRevision] = useState(0);
  const activeQuery = entry?.query;
  const activeSort = entry?.sort;

  useEffect(() => {
    if (view && !storedEntry) {
      setViewEntry(location.key, entryFromView(view));
    }
  }, [location.key, setViewEntry, storedEntry, view]);

  useEffect(() => {
    if (!view || !activeQuery || !activeSort || library === null) return;
    let active = true;
    setLoading(true);
    setError(null);
    setPage(0);
    void executeLibraryQuery({
      entity: view.entity,
      query: activeQuery,
      sort: activeSort,
      page: 0,
      pageSize: 100,
    })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setHasMore(result.hasMore);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The View could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeQuery, activeSort, library, projectionRevision, view]);

  useEffect(() => {
    const refresh = () => setProjectionRevision((revision) => revision + 1);
    window.addEventListener("basis:library-projection-changed", refresh);
    return () =>
      window.removeEventListener("basis:library-projection-changed", refresh);
  }, []);

  if (library === null) {
    return <LibraryRequired />;
  }
  if (!view || !entry) {
    return (
      <section className="page quiet-state" role="alert">
        <h1>View unavailable</h1>
        <p>This View is missing or no longer available.</p>
      </section>
    );
  }

  const itemCount = items?.items.length ?? 0;

  function updateEntry(next: Partial<ViewEntryState>) {
    if (!entry) return;
    setViewEntry(location.key, { ...entry, ...next });
  }

  async function loadMore() {
    if (!view || !entry || loading || !hasMore) return;
    const nextPage = page + 1;
    setLoading(true);
    try {
      const result = await executeLibraryQuery({
        entity: view.entity,
        query: entry.query,
        sort: entry.sort,
        page: nextPage,
        pageSize: 100,
      });
      setItems((current) => appendItems(current, result.items));
      setPage(nextPage);
      setHasMore(result.hasMore);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "More results could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyFilter() {
    const value = filterValue.trim();
    if (!value) return;
    try {
      const expression = await parseLibraryQuery(
        `${filterField}:${JSON.stringify(value)}`,
      );
      updateEntry({ query: combineExpressions(view.query, expression) });
      setActiveFilter(`${filterField}: ${value}`);
      setFilterValue("");
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The filter is invalid.",
      );
    }
  }

  async function persistCurrentView(name: string) {
    try {
      const target = view.id.startsWith("builtin:")
        ? await duplicateView(view.id, name)
        : { ...view, name };
      await saveView({
        ...target,
        name,
        query: entry.query,
        group_by: entry.groupBy,
        sort: entry.sort,
        layout: {
          ...target.layout,
          kind: entry.layout,
          density: entry.density,
          cover_size: entry.coverSize,
          visible_fields: entry.visibleFields,
        },
      });
      await refreshViews();
      setSaveName(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The View could not be saved.",
      );
    }
  }

  return (
    <section className="page library-view" aria-labelledby="view-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">View</p>
          <h1 id="view-title">{view.name}</h1>
        </div>
        <button
          className="text-action"
          type="button"
          onClick={() => setSaveName(view.name)}
        >
          <Save aria-hidden="true" size={16} />
          {view.id.startsWith("builtin:") ? "Save as View" : "Save changes"}
        </button>
      </div>

      <div className="view-toolbar" aria-label={`${view.name} controls`}>
        <span>
          {itemCount}
          {hasMore ? "+" : ""} results
        </span>
        {activeFilter && (
          <button
            className="filter-chip"
            type="button"
            onClick={() => {
              updateEntry({ query: view.query });
              setActiveFilter(null);
            }}
          >
            {activeFilter} <X aria-hidden="true" size={14} />
          </button>
        )}
        <details className="control-popover">
          <summary>
            <Plus aria-hidden="true" size={15} /> Add filter
          </summary>
          <div className="menu-popover filter-builder">
            <label>
              Field
              <select
                value={filterField}
                onChange={(event) =>
                  setFilterField(event.target.value as QueryField)
                }
              >
                {FILTER_FIELDS.map((field) => (
                  <option key={field}>{field}</option>
                ))}
              </select>
            </label>
            <label>
              Value
              <input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
              />
            </label>
            <button type="button" onClick={() => void applyFilter()}>
              Apply
            </button>
          </div>
        </details>
        <label className="compact-control">
          Sort
          <select
            value={entry.sort[0]?.field ?? "title"}
            onChange={(event) =>
              updateEntry({
                sort: [sortFor(event.target.value as QueryField, entry.sort)],
              })
            }
          >
            {sortFieldsFor(view.entity).map((field) => (
              <option key={field}>{field}</option>
            ))}
          </select>
        </label>
        <label className="compact-control">
          Group
          <select
            value={entry.groupBy[0] ?? ""}
            onChange={(event) =>
              updateEntry({
                groupBy: event.target.value
                  ? [event.target.value as QueryField]
                  : [],
              })
            }
          >
            <option value="">None</option>
            {sortFieldsFor(view.entity).map((field) => (
              <option key={field}>{field}</option>
            ))}
          </select>
        </label>
        <label className="compact-control">
          Density
          <select
            value={entry.density}
            onChange={(event) =>
              updateEntry({
                density: event.target.value as ViewEntryState["density"],
              })
            }
          >
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
            <option value="spacious">Spacious</option>
          </select>
        </label>
        {entry.layout === "grid" && (
          <label className="cover-size-control">
            Cover size
            <input
              type="range"
              min="128"
              max="280"
              value={entry.coverSize ?? 192}
              onChange={(event) =>
                updateEntry({ coverSize: Number(event.target.value) })
              }
            />
          </label>
        )}
        {view.entity === "track" && (
          <details className="control-popover">
            <summary>
              <Columns3 aria-hidden="true" size={15} /> Columns
            </summary>
            <div className="menu-popover column-picker">
              {VISIBLE_TRACK_FIELDS.map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={entry.visibleFields.includes(field)}
                    onChange={() =>
                      updateEntry({
                        visibleFields: toggleField(entry.visibleFields, field),
                      })
                    }
                  />
                  {field}
                </label>
              ))}
            </div>
          </details>
        )}
        <div className="segmented-control" aria-label="Representation">
          <button
            type="button"
            aria-label="Grid"
            data-active={entry.layout === "grid" || undefined}
            onClick={() => updateEntry({ layout: "grid" })}
          >
            <Grid2X2 aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            aria-label="List"
            data-active={entry.layout === "list" || undefined}
            onClick={() => updateEntry({ layout: "list" })}
          >
            <List aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            aria-label="Table"
            data-active={entry.layout === "table" || undefined}
            onClick={() => updateEntry({ layout: "table" })}
          >
            <TableProperties aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {items && (
        <ViewItems
          items={items}
          entry={entry}
          onSelectionChange={(selectedIds) => updateEntry({ selectedIds })}
        />
      )}
      {!loading && items && itemCount === 0 && (
        <div className="quiet-state">
          <h2>No results</h2>
          <p>This View does not match any indexed music.</p>
        </div>
      )}
      {loading && itemCount === 0 && (
        <p className="loading-state">
          Loading {view.name.toLocaleLowerCase()}…
        </p>
      )}
      {hasMore && (
        <button
          className="load-more"
          type="button"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}

      {saveName !== null && (
        <div className="dialog-backdrop">
          <form
            className="small-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              void persistCurrentView(saveName);
            }}
          >
            <h2>
              {view.id.startsWith("builtin:")
                ? "Save a custom View"
                : "Save View"}
            </h2>
            <label>
              Name
              <input
                autoFocus
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setSaveName(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function ViewItems({
  items,
  entry,
  onSelectionChange,
}: {
  items: QueryItems;
  entry: ViewEntryState;
  onSelectionChange: (ids: string[]) => void;
}) {
  if (entry.groupBy.length > 0) {
    return (
      <GroupedItems
        items={items}
        entry={entry}
        fields={entry.groupBy}
        onSelectionChange={onSelectionChange}
      />
    );
  }
  return (
    <NaturalItems
      items={items}
      entry={entry}
      onSelectionChange={onSelectionChange}
    />
  );
}

function NaturalItems({
  items,
  entry,
  onSelectionChange,
}: {
  items: QueryItems;
  entry: ViewEntryState;
  onSelectionChange: (ids: string[]) => void;
}) {
  switch (items.kind) {
    case "albums":
      return entry.layout === "grid" ? (
        <AlbumGrid albums={items.items} coverSize={entry.coverSize} />
      ) : (
        <div className="entity-list">
          {items.items.map((album) => (
            <Link
              className="list-entity"
              to={`/albums/${album.albumKey}`}
              key={album.albumKey}
            >
              <span>
                <span className="entity-title">{album.title}</span>
                <span className="entity-subtitle">{album.albumArtist}</span>
              </span>
              <span className="entity-subtitle">
                {album.year ?? "Unknown year"} · {album.trackCount} tracks
              </span>
            </Link>
          ))}
        </div>
      );
    case "artists":
      return entry.layout === "grid" ? (
        <ArtistGrid artists={items.items} />
      ) : (
        <div className="entity-list">
          {items.items.map((artist) => (
            <Link
              className="list-entity"
              to={`/artists/${artist.artistKey}`}
              key={artist.artistKey}
            >
              <span className="entity-title">{artist.name}</span>
              <span className="entity-subtitle">
                {artist.albumCount} albums · {artist.trackCount} tracks
              </span>
            </Link>
          ))}
        </div>
      );
    case "tracks":
      return (
        <PlayableTracks
          tracks={items.items}
          entry={entry}
          onSelectionChange={onSelectionChange}
        />
      );
    case "folders":
      return entry.layout === "grid" ? (
        <div className="facet-list">
          {items.items.map((folder) => (
            <span className="facet-entity" key={folder.path}>
              {folder.name}
              <small>{folder.trackCount} tracks</small>
            </span>
          ))}
        </div>
      ) : (
        <div className="entity-list">
          {items.items.map((folder) => (
            <div className="list-entity" key={folder.path}>
              <span className="entity-title">{folder.name}</span>
              <span className="entity-subtitle">
                {folder.path} · {folder.trackCount} tracks
              </span>
            </div>
          ))}
        </div>
      );
    case "genres":
      return entry.layout === "grid" ? (
        <div className="facet-list">
          {items.items.map((genre) => (
            <span className="facet-entity" key={genre.name}>
              {genre.name}
              <small>{genre.trackCount} tracks</small>
            </span>
          ))}
        </div>
      ) : (
        <div className="entity-list">
          {items.items.map((genre) => (
            <div className="list-entity" key={genre.name}>
              <span className="entity-title">{genre.name}</span>
              <span className="entity-subtitle">{genre.trackCount} tracks</span>
            </div>
          ))}
        </div>
      );
  }
}

function PlayableTracks({
  tracks,
  entry,
  onSelectionChange,
}: {
  tracks: TrackDto[];
  entry: ViewEntryState;
  onSelectionChange: (ids: string[]) => void;
}) {
  const navigate = useNavigate();
  const player = usePlayer();
  const [playlistTracks, setPlaylistTracks] = useState<TrackDto[] | null>(null);
  const selectedTracks = tracks.filter((track) =>
    entry.selectedIds.includes(track.id),
  );

  async function playNow(startTrackId: string) {
    const started = await player.playCollection(
      tracks.map((track) => track.id),
      startTrackId,
    );
    if (started) navigate("/now-playing");
  }

  if (entry.layout === "grid") {
    return (
      <>
        {selectedTracks.length > 0 && (
          <div className="selection-actions" aria-label="Selection actions">
            <span>{selectedTracks.length} selected</span>
            <button
              type="button"
              onClick={() => setPlaylistTracks(selectedTracks)}
            >
              Add to playlist
            </button>
          </div>
        )}
        <div className="track-grid">
          {tracks.map((track) => {
            const selected = entry.selectedIds.includes(track.id);
            return (
              <button
                className="track-tile"
                data-selected={selected || undefined}
                key={track.id}
                type="button"
                onClick={() =>
                  onSelectionChange(
                    selected
                      ? entry.selectedIds.filter((id) => id !== track.id)
                      : [...entry.selectedIds, track.id],
                  )
                }
                onDoubleClick={() => void playNow(track.id)}
              >
                <ArtworkPlaceholder
                  title={displayTrackTitle(track.title, track.relPath)}
                  artworkKey={track.artworkKey}
                  seed={track.relPath}
                />
                <span className="entity-title">
                  {displayTrackTitle(track.title, track.relPath)}
                </span>
                <span className="entity-subtitle">
                  {track.artist ?? "Unknown artist"}
                </span>
              </button>
            );
          })}
        </div>
        {playlistTracks && (
          <PlaylistPicker
            tracks={playlistTracks}
            onClose={() => setPlaylistTracks(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      {selectedTracks.length > 0 && (
        <div className="selection-actions" aria-label="Selection actions">
          <span>{selectedTracks.length} selected</span>
          <button
            type="button"
            onClick={() => setPlaylistTracks(selectedTracks)}
          >
            Add to playlist
          </button>
        </div>
      )}
      <TrackList
        tracks={tracks}
        compact={entry.density === "compact" || entry.layout === "list"}
        visibleFields={entry.visibleFields}
        selectedIds={entry.selectedIds}
        onSelectionChange={onSelectionChange}
        onPlayTrack={(track) => void playNow(track.id)}
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

function GroupedItems({
  items,
  entry,
  fields,
  onSelectionChange,
}: {
  items: QueryItems;
  entry: ViewEntryState;
  fields: QueryField[];
  onSelectionChange: (ids: string[]) => void;
}) {
  switch (items.kind) {
    case "albums":
      return (
        <GroupedEntities
          items={items.items}
          fields={fields}
          keyFor={(album, field) => albumGroupKey(album, field)}
          render={(albums) => (
            <NaturalItems
              items={{ kind: "albums", items: albums }}
              entry={entry}
              onSelectionChange={onSelectionChange}
            />
          )}
        />
      );
    case "artists":
      return (
        <GroupedEntities
          items={items.items}
          fields={fields}
          keyFor={(artist, field) =>
            field === "artist"
              ? artist.name.slice(0, 1).toLocaleUpperCase() || "Other"
              : "Other"
          }
          render={(artists) => (
            <NaturalItems
              items={{ kind: "artists", items: artists }}
              entry={entry}
              onSelectionChange={onSelectionChange}
            />
          )}
        />
      );
    case "tracks":
      return (
        <GroupedEntities
          items={items.items}
          fields={fields}
          keyFor={(track, field) => trackGroupKey(track, field)}
          render={(tracks) => (
            <NaturalItems
              items={{ kind: "tracks", items: tracks }}
              entry={entry}
              onSelectionChange={onSelectionChange}
            />
          )}
        />
      );
    case "folders":
      return (
        <GroupedEntities
          items={items.items}
          fields={fields}
          keyFor={(folder, field) =>
            field === "path" ? folder.path.split("/")[0] || "Root" : "Other"
          }
          render={(folders) => (
            <NaturalItems
              items={{ kind: "folders", items: folders }}
              entry={entry}
              onSelectionChange={onSelectionChange}
            />
          )}
        />
      );
    case "genres":
      return (
        <GroupedEntities
          items={items.items}
          fields={fields}
          keyFor={(genre, field) =>
            field === "genre"
              ? genre.name.slice(0, 1).toLocaleUpperCase() || "Other"
              : "Other"
          }
          render={(genres) => (
            <NaturalItems
              items={{ kind: "genres", items: genres }}
              entry={entry}
              onSelectionChange={onSelectionChange}
            />
          )}
        />
      );
  }
}

function GroupedEntities<T>({
  items,
  fields,
  keyFor,
  render,
}: {
  items: T[];
  fields: QueryField[];
  keyFor: (item: T, field: QueryField) => string;
  render: (items: T[]) => ReactNode;
}) {
  const [field, ...remaining] = fields;
  if (!field) return render(items);
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item, field) || "Other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return (
    <div className="view-groups">
      {[...groups.entries()].map(([key, groupedItems]) => (
        <section className="view-group" key={`${field}:${key}`}>
          <h2>{key}</h2>
          <GroupedEntities
            items={groupedItems}
            fields={remaining}
            keyFor={keyFor}
            render={render}
          />
        </section>
      ))}
    </div>
  );
}

function LibraryRequired() {
  const { chooseLibrary, choosingLibrary, libraryError } = useLibraryContext();
  return (
    <section className="page quiet-state">
      <h1>Library</h1>
      <h2>No music folder added.</h2>
      <button
        type="button"
        onClick={() => void chooseLibrary()}
        disabled={choosingLibrary}
      >
        {choosingLibrary ? "Opening…" : "Add folder"}
      </button>
      <p>
        Add a folder to index your music library.
        <br />
        Basis does not move or reorganize audio files.
      </p>
      {libraryError && (
        <p className="inline-error" role="alert">
          {libraryError}
        </p>
      )}
    </section>
  );
}

function entryFromView(view: ViewDefinition): ViewEntryState {
  return {
    layout: view.layout.kind,
    density: view.layout.density,
    query: view.query,
    sort: view.sort,
    groupBy: view.group_by,
    visibleFields: view.layout.visible_fields,
    coverSize: view.layout.cover_size,
    selectedIds: [],
  };
}

function combineExpressions(base: Expr, filter: Expr): Expr {
  if (base.kind === "and" && base.items.length === 0) return filter;
  return { kind: "and", items: [base, filter] };
}

function appendItems(current: QueryItems | null, next: QueryItems): QueryItems {
  if (current === null || current.kind !== next.kind) return next;
  switch (current.kind) {
    case "tracks":
      return {
        kind: "tracks",
        items: [
          ...current.items,
          ...(next.kind === "tracks" ? next.items : []),
        ],
      };
    case "albums":
      return {
        kind: "albums",
        items: [
          ...current.items,
          ...(next.kind === "albums" ? next.items : []),
        ],
      };
    case "artists":
      return {
        kind: "artists",
        items: [
          ...current.items,
          ...(next.kind === "artists" ? next.items : []),
        ],
      };
    case "folders":
      return {
        kind: "folders",
        items: [
          ...current.items,
          ...(next.kind === "folders" ? next.items : []),
        ],
      };
    case "genres":
      return {
        kind: "genres",
        items: [
          ...current.items,
          ...(next.kind === "genres" ? next.items : []),
        ],
      };
  }
}

function sortFieldsFor(entity: ViewDefinition["entity"]): QueryField[] {
  switch (entity) {
    case "album":
      return ["album", "albumArtist", "year"];
    case "artist":
      return ["artist"];
    case "folder":
      return ["path"];
    case "genre":
      return ["genre"];
    case "track":
      return [
        "title",
        "artist",
        "album",
        "year",
        "duration",
        "addedAt",
        "lastPlayed",
        "playCount",
      ];
  }
}

function sortFor(field: QueryField, current: QuerySort[]): QuerySort {
  return {
    field,
    direction: current[0]?.field === field ? current[0].direction : "asc",
  };
}

function toggleField(fields: QueryField[], field: QueryField) {
  return fields.includes(field)
    ? fields.filter((candidate) => candidate !== field)
    : [...fields, field];
}

function albumGroupKey(album: AlbumDto, field: QueryField) {
  switch (field) {
    case "album":
      return album.title.slice(0, 1).toLocaleUpperCase() || "Other";
    case "albumArtist":
    case "artist":
      return album.albumArtist || "Unknown artist";
    case "year":
      return album.year?.toString() ?? "Unknown year";
    default:
      return "Other";
  }
}

function trackGroupKey(track: TrackDto, field: QueryField) {
  switch (field) {
    case "title":
      return displayTrackTitle(track.title, track.relPath)
        .slice(0, 1)
        .toLocaleUpperCase();
    case "artist":
      return track.artist ?? "Unknown artist";
    case "album":
      return track.album ?? "Unknown album";
    case "albumArtist":
      return track.albumArtist ?? "Unknown album artist";
    case "year":
      return track.year?.toString() ?? "Unknown year";
    case "genre":
      return track.genres[0] ?? "Unknown genre";
    case "codec":
      return track.codec?.toLocaleUpperCase() ?? "Unknown codec";
    default:
      return "Other";
  }
}
