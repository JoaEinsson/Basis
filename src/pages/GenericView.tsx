import {
  Columns3,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  Save,
  TableProperties,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArtworkPlaceholder } from "../components/library/ArtworkPlaceholder";
import {
  displayTrackTitle,
  formatDuration,
} from "../components/library/format";
import { AlbumGrid } from "../components/library/AlbumGrid";
import { ArtistGrid } from "../components/library/ArtistGrid";
import { TrackActionMenu } from "../components/library/TrackActionMenu";
import { TrackList } from "../components/library/TrackList";
import { PlaylistPicker } from "../components/playlists/PlaylistPicker";
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  EmptyState,
  FilterChip,
  LocalErrorState,
  Popover,
  RangeInput,
  SegmentedControl,
  SelectInput,
  Skeleton,
  TextInput,
} from "../components/ui";
import {
  duplicateView,
  executeLibraryQuery,
  parseLibraryQuery,
  saveView,
  setFavorite,
} from "../lib/tauri";
import type {
  AlbumDto,
  ArtistDto,
  Expr,
  FolderDto,
  GenreDto,
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const facetSelection = useMemo(
    () => facetSelectionFromSearch(view?.entity, searchParams),
    [searchParams, view?.entity],
  );
  const executionQuery = useMemo(
    () =>
      activeQuery && facetSelection
        ? combineExpressions(
            activeQuery,
            facetPredicate(facetSelection.kind, facetSelection.value),
          )
        : activeQuery,
    [activeQuery, facetSelection],
  );
  const executionEntity = facetSelection ? "track" : view?.entity;
  const executionSort = useMemo(
    () =>
      facetSelection
        ? ([{ field: "path", direction: "asc" }] satisfies QuerySort[])
        : activeSort,
    [activeSort, facetSelection],
  );

  useEffect(() => {
    if (view && !storedEntry) {
      setViewEntry(location.key, entryFromView(view));
    }
  }, [location.key, setViewEntry, storedEntry, view]);

  useEffect(() => {
    if (
      !view ||
      !executionEntity ||
      !executionQuery ||
      !executionSort ||
      library === null
    )
      return;
    let active = true;
    setLoading(true);
    setError(null);
    setPage(0);
    setItems(null);
    void executeLibraryQuery({
      entity: executionEntity,
      query: executionQuery,
      sort: executionSort,
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
  }, [
    executionEntity,
    executionQuery,
    executionSort,
    library,
    projectionRevision,
    view,
  ]);

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
    if (
      !entry ||
      !executionEntity ||
      !executionQuery ||
      !executionSort ||
      loading ||
      !hasMore
    )
      return;
    const nextPage = page + 1;
    setLoading(true);
    try {
      const result = await executeLibraryQuery({
        entity: executionEntity,
        query: executionQuery,
        sort: executionSort,
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

  function openFacet(kind: FacetKind, value: string) {
    const next = new URLSearchParams();
    next.set(kind, value);
    navigate({ pathname: location.pathname, search: next.toString() });
  }

  if (facetSelection) {
    const tracks = items?.kind === "tracks" ? items.items : [];
    return (
      <section
        className="page library-view facet-detail"
        aria-labelledby="facet-title"
        onContextMenu={suppressNativeContextMenu}
      >
        <button
          className="back-context"
          type="button"
          onClick={() => navigate({ pathname: location.pathname })}
        >
          Back to {facetSelection.kind === "folder" ? "Folders" : "Genres"}
        </button>
        <FacetBreadcrumb
          selection={facetSelection}
          onRoot={() => navigate({ pathname: location.pathname })}
          onOpen={(value) => openFacet(facetSelection.kind, value)}
        />
        <div className="page-heading">
          <div>
            <p className="page-kicker">{facetSelection.kind}</p>
            <h1 id="facet-title">{facetSelection.value || "Library root"}</h1>
            <p className="entity-subtitle">
              {tracks.length}
              {hasMore ? "+" : ""} tracks
            </p>
          </div>
        </div>
        {error && tracks.length > 0 && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {error && tracks.length === 0 && (
          <LocalErrorState
            title="Tracks could not be loaded"
            onRetry={() => setProjectionRevision((revision) => revision + 1)}
          >
            <p>{error}</p>
          </LocalErrorState>
        )}
        {loading && tracks.length === 0 && (
          <ViewLoadingState label="Loading tracks" />
        )}
        {tracks.length > 0 && (
          <PlayableTracks
            tracks={tracks}
            entry={{
              ...entry,
              layout: "table",
              groupBy: [],
            }}
            onSelectionChange={(selectedIds) => updateEntry({ selectedIds })}
          />
        )}
        {!loading && tracks.length === 0 && !error && (
          <EmptyState title="No tracks">
            <p>This {facetSelection.kind} has no indexed tracks.</p>
          </EmptyState>
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
      </section>
    );
  }

  return (
    <section
      className="page library-view"
      aria-labelledby="view-title"
      onContextMenu={suppressNativeContextMenu}
    >
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
          <FilterChip
            className="filter-chip"
            active
            onClick={() => {
              updateEntry({ query: view.query });
              setActiveFilter(null);
            }}
          >
            {activeFilter} <X aria-hidden="true" size={14} />
          </FilterChip>
        )}
        <Popover
          ariaLabel="Add filter"
          className="filter-builder"
          trigger={
            <Button>
              <Plus aria-hidden="true" size={15} /> Add filter
            </Button>
          }
        >
          <label>
            Field
            <SelectInput
              value={filterField}
              onChange={(event) =>
                setFilterField(event.target.value as QueryField)
              }
            >
              {FILTER_FIELDS.map((field) => (
                <option key={field}>{field}</option>
              ))}
            </SelectInput>
          </label>
          <label>
            Value
            <TextInput
              value={filterValue}
              onChange={(event) => setFilterValue(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void applyFilter()}>
            Apply
          </button>
        </Popover>
        <label className="compact-control">
          Sort
          <SelectInput
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
          </SelectInput>
        </label>
        <label className="compact-control">
          Group
          <SelectInput
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
          </SelectInput>
        </label>
        <label className="compact-control">
          Density
          <SelectInput
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
          </SelectInput>
        </label>
        {entry.layout === "grid" && (
          <label className="cover-size-control">
            Cover size
            <RangeInput
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
          <Popover
            ariaLabel="Track columns"
            className="column-picker"
            trigger={
              <Button>
                <Columns3 aria-hidden="true" size={15} /> Columns
              </Button>
            }
          >
            {VISIBLE_TRACK_FIELDS.map((field) => (
              <Checkbox
                key={field}
                checked={entry.visibleFields.includes(field)}
                onChange={() =>
                  updateEntry({
                    visibleFields: toggleField(entry.visibleFields, field),
                  })
                }
              >
                {field}
              </Checkbox>
            ))}
          </Popover>
        )}
        <SegmentedControl
          ariaLabel="Representation"
          className="segmented-control"
          value={entry.layout}
          onChange={(layout) => updateEntry({ layout })}
          options={[
            {
              label: "Grid",
              value: "grid",
              content: <Grid2X2 aria-hidden="true" size={16} />,
            },
            {
              label: "List",
              value: "list",
              content: <List aria-hidden="true" size={16} />,
            },
            {
              label: "Table",
              value: "table",
              content: <TableProperties aria-hidden="true" size={16} />,
            },
          ]}
        />
      </div>

      {error && itemCount > 0 && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {error && itemCount === 0 && (
        <LocalErrorState
          title={`${view.name} could not be loaded`}
          onRetry={() => setProjectionRevision((revision) => revision + 1)}
        >
          <p>{error}</p>
        </LocalErrorState>
      )}
      {items && (
        <ViewItems
          items={items}
          entry={entry}
          onSelectionChange={(selectedIds) => updateEntry({ selectedIds })}
          onOpenFacet={openFacet}
        />
      )}
      {!loading && items && itemCount === 0 && (
        <EmptyState title="No results">
          <p>This View does not match any indexed music.</p>
        </EmptyState>
      )}
      {loading && itemCount === 0 && !error && (
        <ViewLoadingState label={`Loading ${view.name.toLocaleLowerCase()}`} />
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
        <Dialog
          className="small-dialog"
          ariaLabel={
            view.id.startsWith("builtin:") ? "Save a custom View" : "Save View"
          }
          onClose={() => setSaveName(null)}
        >
          <form
            className="ui-dialog-form"
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
            <DialogActions>
              <button type="button" onClick={() => setSaveName(null)}>
                Cancel
              </button>
              <button type="submit">Save</button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </section>
  );
}

function ViewItems({
  items,
  entry,
  onSelectionChange,
  onOpenFacet,
}: {
  items: QueryItems;
  entry: ViewEntryState;
  onSelectionChange: (ids: string[]) => void;
  onOpenFacet: (kind: FacetKind, value: string) => void;
}) {
  if (entry.groupBy.length > 0) {
    return (
      <GroupedItems
        items={items}
        entry={entry}
        fields={entry.groupBy}
        onSelectionChange={onSelectionChange}
        onOpenFacet={onOpenFacet}
      />
    );
  }
  return (
    <NaturalItems
      items={items}
      entry={entry}
      onSelectionChange={onSelectionChange}
      onOpenFacet={onOpenFacet}
    />
  );
}

export function NaturalItems({
  items,
  entry,
  onSelectionChange,
  onOpenFacet,
}: {
  items: QueryItems;
  entry: ViewEntryState;
  onSelectionChange: (ids: string[]) => void;
  onOpenFacet: (kind: FacetKind, value: string) => void;
}) {
  switch (items.kind) {
    case "albums": {
      if (entry.layout === "grid") {
        return (
          <AlbumGrid
            albums={items.items}
            coverSize={entry.coverSize}
            density={entry.density}
          />
        );
      }
      if (entry.layout === "table") {
        return <AlbumTable albums={items.items} density={entry.density} />;
      }
      return (
        <div className="entity-list" data-density={entry.density}>
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
    }
    case "artists": {
      if (entry.layout === "grid") {
        return <ArtistGrid artists={items.items} density={entry.density} />;
      }
      if (entry.layout === "table") {
        return <ArtistTable artists={items.items} density={entry.density} />;
      }
      return (
        <div className="entity-list" data-density={entry.density}>
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
    }
    case "tracks":
      return (
        <PlayableTracks
          tracks={items.items}
          entry={entry}
          onSelectionChange={onSelectionChange}
        />
      );
    case "folders": {
      if (entry.layout === "table") {
        return (
          <FolderTable
            folders={items.items}
            density={entry.density}
            onOpen={(path) => onOpenFacet("folder", path)}
          />
        );
      }
      return entry.layout === "grid" ? (
        <div className="facet-list" data-density={entry.density}>
          {items.items.map((folder) => (
            <button
              type="button"
              className="facet-entity"
              key={folder.path}
              onClick={() => onOpenFacet("folder", folder.path)}
            >
              {folder.name}
              <small>{folder.trackCount} tracks</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="entity-list" data-density={entry.density}>
          {items.items.map((folder) => (
            <button
              type="button"
              className="list-entity"
              key={folder.path}
              onClick={() => onOpenFacet("folder", folder.path)}
            >
              <span className="entity-title">{folder.name}</span>
              <span className="entity-subtitle">
                {folder.path} · {folder.trackCount} tracks
              </span>
            </button>
          ))}
        </div>
      );
    }
    case "genres": {
      if (entry.layout === "table") {
        return (
          <GenreTable
            genres={items.items}
            density={entry.density}
            onOpen={(name) => onOpenFacet("genre", name)}
          />
        );
      }
      return entry.layout === "grid" ? (
        <div className="facet-list" data-density={entry.density}>
          {items.items.map((genre) => (
            <button
              type="button"
              className="facet-entity"
              key={genre.name}
              onClick={() => onOpenFacet("genre", genre.name)}
            >
              {genre.name}
              <small>{genre.trackCount} tracks</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="entity-list" data-density={entry.density}>
          {items.items.map((genre) => (
            <button
              type="button"
              className="list-entity"
              key={genre.name}
              onClick={() => onOpenFacet("genre", genre.name)}
            >
              <span className="entity-title">{genre.name}</span>
              <span className="entity-subtitle">{genre.trackCount} tracks</span>
            </button>
          ))}
        </div>
      );
    }
  }
}

function AlbumTable({
  albums,
  density,
}: {
  albums: AlbumDto[];
  density: ViewEntryState["density"];
}) {
  return (
    <EntityTable
      density={density}
      label="Albums"
      headings={["Album", "Artist", "Year", "Tracks", "Duration"]}
    >
      {albums.map((album) => (
        <tr key={album.albumKey}>
          <td>
            <Link
              className="table-entity-action"
              to={`/albums/${album.albumKey}`}
            >
              {album.title}
            </Link>
          </td>
          <td>{album.albumArtist}</td>
          <td>{album.year ?? "—"}</td>
          <td>{album.trackCount}</td>
          <td>{formatDuration(album.durationMs)}</td>
        </tr>
      ))}
    </EntityTable>
  );
}

function ArtistTable({
  artists,
  density,
}: {
  artists: ArtistDto[];
  density: ViewEntryState["density"];
}) {
  return (
    <EntityTable
      density={density}
      label="Artists"
      headings={["Artist", "Albums", "Tracks"]}
    >
      {artists.map((artist) => (
        <tr key={artist.artistKey}>
          <td>
            <Link
              className="table-entity-action"
              to={`/artists/${artist.artistKey}`}
            >
              {artist.name}
            </Link>
          </td>
          <td>{artist.albumCount}</td>
          <td>{artist.trackCount}</td>
        </tr>
      ))}
    </EntityTable>
  );
}

function FolderTable({
  folders,
  density,
  onOpen,
}: {
  folders: FolderDto[];
  density: ViewEntryState["density"];
  onOpen: (path: string) => void;
}) {
  return (
    <EntityTable
      density={density}
      label="Folders"
      headings={["Folder", "Path", "Tracks"]}
    >
      {folders.map((folder) => (
        <tr key={folder.path}>
          <td>
            <button
              className="table-entity-action"
              type="button"
              onClick={() => onOpen(folder.path)}
            >
              {folder.name}
            </button>
          </td>
          <td>{folder.path}</td>
          <td>{folder.trackCount}</td>
        </tr>
      ))}
    </EntityTable>
  );
}

function GenreTable({
  genres,
  density,
  onOpen,
}: {
  genres: GenreDto[];
  density: ViewEntryState["density"];
  onOpen: (name: string) => void;
}) {
  return (
    <EntityTable
      density={density}
      label="Genres"
      headings={["Genre", "Tracks"]}
    >
      {genres.map((genre) => (
        <tr key={genre.name}>
          <td>
            <button
              className="table-entity-action"
              type="button"
              onClick={() => onOpen(genre.name)}
            >
              {genre.name}
            </button>
          </td>
          <td>{genre.trackCount}</td>
        </tr>
      ))}
    </EntityTable>
  );
}

function EntityTable({
  density,
  label,
  headings,
  children,
}: {
  density: ViewEntryState["density"];
  label: string;
  headings: string[];
  children: ReactNode;
}) {
  return (
    <div className="entity-table-viewport">
      <table className="entity-table" data-density={density} aria-label={label}>
        <thead>
          <tr>
            {headings.map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
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
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    trackId: string;
    x: number;
    y: number;
  } | null>(null);
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

  async function playSelection(ids: string[]) {
    const started = await player.playCollection(ids, ids[0]);
    if (started) navigate("/now-playing");
  }

  function selectTrack(
    index: number,
    trackId: string,
    event: MouseEvent<HTMLButtonElement>,
  ) {
    if (event.shiftKey) {
      const anchor = selectionAnchor ?? index;
      const first = Math.min(anchor, index);
      const last = Math.max(anchor, index);
      const next =
        event.ctrlKey || event.metaKey
          ? new Set(entry.selectedIds)
          : new Set<string>();
      for (let cursor = first; cursor <= last; cursor += 1) {
        next.add(tracks[cursor].id);
      }
      onSelectionChange([...next]);
      return;
    }
    setSelectionAnchor(index);
    const selected = entry.selectedIds.includes(trackId);
    if (event.ctrlKey || event.metaKey) {
      onSelectionChange(
        selected
          ? entry.selectedIds.filter((id) => id !== trackId)
          : [...entry.selectedIds, trackId],
      );
      return;
    }
    onSelectionChange(
      selected && entry.selectedIds.length === 1 ? [] : [trackId],
    );
  }

  function renderSelectionActions() {
    if (selectedTracks.length === 0) return null;
    const ids = selectedTracks.map((track) => track.id);
    return (
      <div className="selection-actions" aria-label="Selection actions">
        <span>{selectedTracks.length} selected</span>
        <button type="button" onClick={() => void playSelection(ids)}>
          Play selected
        </button>
        <button
          type="button"
          onClick={() => void player.playCollection(ids, ids[0], "append")}
        >
          Add to queue
        </button>
        <button type="button" onClick={() => setPlaylistTracks(selectedTracks)}>
          Add to playlist
        </button>
        <button type="button" onClick={() => onSelectionChange([])}>
          Clear
        </button>
      </div>
    );
  }

  if (entry.layout === "grid") {
    return (
      <>
        {renderSelectionActions()}
        <div className="track-grid" data-density={entry.density}>
          {tracks.map((track, index) => {
            const selected = entry.selectedIds.includes(track.id);
            const playing =
              player.snapshot?.currentTrack?.track.id === track.id;
            return (
              <div
                className="track-tile"
                data-selected={selected || undefined}
                data-playing={playing || undefined}
                key={track.id}
                role="option"
                aria-selected={selected}
                aria-current={playing ? "true" : undefined}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (!selected) onSelectionChange([track.id]);
                  setContextMenu({
                    trackId: track.id,
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <button
                  className="track-tile-main"
                  type="button"
                  draggable
                  onDragStart={(event) => setTrackDragData(event, track)}
                  onClick={(event) => selectTrack(index, track.id, event)}
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
                <button
                  className="track-tile-actions"
                  type="button"
                  aria-label={`Actions for ${displayTrackTitle(track.title, track.relPath)}`}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      trackId: track.id,
                      x: Math.max(bounds.left, bounds.right - 192),
                      y: bounds.bottom,
                    });
                  }}
                >
                  <MoreHorizontal aria-hidden="true" size={17} />
                </button>
              </div>
            );
          })}
        </div>
        {contextMenu &&
          tracks.find((track) => track.id === contextMenu.trackId) && (
            <TrackActionMenu
              track={tracks.find((track) => track.id === contextMenu.trackId)!}
              position={contextMenu}
              onClose={() => setContextMenu(null)}
              onPlayTrack={(track) => void playNow(track.id)}
              onPlayNext={(track) =>
                void player.playCollection([track.id], track.id, "next")
              }
              onAddToQueue={(track) =>
                void player.playCollection([track.id], track.id, "append")
              }
              onAddToPlaylist={(track) => setPlaylistTracks([track])}
              onFavorite={(track, value) => void setFavorite(track.id, value)}
              onSelectOnly={(track) => onSelectionChange([track.id])}
              onClearSelection={() => onSelectionChange([])}
            />
          )}
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
      {renderSelectionActions()}
      <TrackList
        tracks={tracks}
        playingTrackId={player.snapshot?.currentTrack?.track.id}
        density={entry.density}
        layout={entry.layout}
        visibleFields={
          entry.layout === "list"
            ? entry.visibleFields.filter((field) =>
                ["title", "artist"].includes(field),
              )
            : entry.visibleFields
        }
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
  onOpenFacet,
}: {
  items: QueryItems;
  entry: ViewEntryState;
  fields: QueryField[];
  onSelectionChange: (ids: string[]) => void;
  onOpenFacet: (kind: FacetKind, value: string) => void;
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
              onOpenFacet={onOpenFacet}
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
              onOpenFacet={onOpenFacet}
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
              onOpenFacet={onOpenFacet}
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
              onOpenFacet={onOpenFacet}
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
              onOpenFacet={onOpenFacet}
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

function FacetBreadcrumb({
  selection,
  onRoot,
  onOpen,
}: {
  selection: FacetSelection;
  onRoot: () => void;
  onOpen: (value: string) => void;
}) {
  const segments =
    selection.kind === "folder"
      ? selection.value.split("/").filter(Boolean)
      : [selection.value];
  return (
    <nav className="facet-breadcrumb" aria-label={`${selection.kind} path`}>
      <button type="button" onClick={onRoot}>
        {selection.kind === "folder" ? "Folders" : "Genres"}
      </button>
      {segments.map((segment, index) => {
        const value = segments.slice(0, index + 1).join("/");
        const current = index === segments.length - 1;
        return (
          <span key={value || segment}>
            <span aria-hidden="true">/</span>
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              disabled={current}
              onClick={() => onOpen(value)}
            >
              {segment || "Library root"}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function ViewLoadingState({ label }: { label: string }) {
  return (
    <div className="view-loading-state" aria-label={label}>
      <Skeleton label={label} />
      <Skeleton label={label} />
      <Skeleton label={label} />
    </div>
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

type FacetKind = "folder" | "genre";

type FacetSelection = {
  kind: FacetKind;
  value: string;
};

function facetSelectionFromSearch(
  entity: ViewDefinition["entity"] | undefined,
  searchParams: URLSearchParams,
): FacetSelection | null {
  if (entity === "folder" && searchParams.has("folder")) {
    return { kind: "folder", value: searchParams.get("folder") ?? "" };
  }
  if (entity === "genre" && searchParams.has("genre")) {
    return { kind: "genre", value: searchParams.get("genre") ?? "" };
  }
  return null;
}

export function facetPredicate(kind: FacetKind, value: string): Expr {
  if (kind === "folder") {
    return value
      ? {
          kind: "predicate",
          field: "path",
          op: "startsWith",
          value: `${value}/`,
        }
      : {
          kind: "not",
          item: {
            kind: "predicate",
            field: "path",
            op: "contains",
            value: "/",
          },
        };
  }
  return {
    kind: "predicate",
    field: "genre",
    op: "eq",
    value,
  };
}

function suppressNativeContextMenu(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, [contenteditable='true']") ||
      target.closest("input, textarea, [contenteditable='true']"))
  ) {
    return;
  }
  event.preventDefault();
}

function setTrackDragData(event: DragEvent<HTMLElement>, track: TrackDto) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(
    "application/x-basis-track",
    JSON.stringify(track),
  );
  event.dataTransfer.setData("text/plain", track.relPath);
}
