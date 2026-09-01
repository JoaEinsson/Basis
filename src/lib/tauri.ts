import type { UnlistenFn } from "@tauri-apps/api/event";
import { commands, events } from "./bindings";
import type {
  AlbumDetailDto,
  AppHealth,
  ArtistDetailDto,
  Expr,
  GlobalSearchResults,
  LibraryScanEvent,
  LibraryChangedEvent,
  LibrarySummary,
  PlayerErrorEvent,
  PlayerQueueChangedEvent,
  PlayerSnapshot,
  PlayerStateEvent,
  PlayerTrackChangedEvent,
  Playlist,
  PlaylistCatalog,
  PlaylistDraft,
  QueryPage,
  QueryRequest,
  QueueInsertMode,
  RepeatMode,
  ResolvedPlaylist,
  SearchRequest,
  ThemeAppearance,
  ThemeCatalog,
  ThemeSelectionDto,
  ThemeSummary,
  ThemeTokenDescriptor,
  ThemeTokenValue,
  EditableTheme,
  ResolvedTheme,
  ViewDefinition,
  HistoryEvent,
  LyricsResolution,
  UpdateCheckPermit,
  UpdatePolicy,
} from "./types";

export function getAppHealth(): Promise<AppHealth> {
  return commands.appHealth();
}

export async function getUpdatePolicy(): Promise<UpdatePolicy> {
  return unwrapResult(await commands.updaterPolicy());
}

export async function beginUpdateCheck(
  manual: boolean,
): Promise<UpdateCheckPermit> {
  return unwrapResult(await commands.updaterBeginCheck(manual));
}

export async function setAutomaticUpdateChecks(
  enabled: boolean,
): Promise<UpdatePolicy> {
  return unwrapResult(await commands.updaterSetAutomaticChecks(enabled));
}

export async function chooseLibraryRoot(): Promise<LibrarySummary | null> {
  return unwrapResult(await commands.libraryChooseRoot());
}

export async function getLibraryStatus(): Promise<LibrarySummary | null> {
  return unwrapResult(await commands.libraryStatus());
}

export async function getArtworkThumbnail(
  artworkKey: string,
  dimension: 64 | 128 | 256 | 512,
): Promise<string | null> {
  return unwrapResult(await commands.artworkThumbnail(artworkKey, dimension));
}

export async function resolveLyrics(
  trackId: string,
  allowNetwork = true,
): Promise<LyricsResolution> {
  return unwrapResult(await commands.lyricsResolve(trackId, allowNetwork));
}

export async function chooseLyricsCandidate(
  trackId: string,
  candidateId: number,
): Promise<LyricsResolution> {
  return unwrapResult(
    await commands.lyricsChooseCandidate(trackId, candidateId),
  );
}

export async function parseLibraryQuery(input: string): Promise<Expr> {
  return unwrapResult(await commands.queryParse(input));
}

export async function executeLibraryQuery(
  request: QueryRequest,
): Promise<QueryPage> {
  return unwrapResult(await commands.queryExecute(request));
}

export async function searchLibrary(
  request: SearchRequest,
): Promise<GlobalSearchResults> {
  return unwrapResult(await commands.searchGlobal(request));
}

export async function listViews(): Promise<ViewDefinition[]> {
  return unwrapResult(await commands.viewsList());
}

export async function saveView(view: ViewDefinition): Promise<ViewDefinition> {
  return unwrapResult(await commands.viewsSave(view));
}

export async function duplicateView(
  sourceId: string,
  name: string,
): Promise<ViewDefinition> {
  return unwrapResult(await commands.viewsDuplicate(sourceId, name));
}

export async function deleteView(id: string): Promise<void> {
  unwrapResult(await commands.viewsDelete(id));
}

export async function setPinnedViews(ids: string[]): Promise<string[]> {
  return unwrapResult(await commands.viewsSetPinned(ids));
}

export async function getAlbumDetail(
  albumKey: string,
): Promise<AlbumDetailDto | null> {
  return unwrapResult(await commands.albumDetail(albumKey));
}

export async function getArtistDetail(
  artistKey: string,
): Promise<ArtistDetailDto | null> {
  return unwrapResult(await commands.artistDetail(artistKey));
}

export async function listThemes(): Promise<ThemeCatalog> {
  return unwrapResult(await commands.themesList());
}

export async function getEditableTheme(id: string): Promise<EditableTheme> {
  return unwrapResult(await commands.themeGetEditable(id));
}

export async function resolveTheme(
  id: string,
  artworkKey: string | null = null,
): Promise<ResolvedTheme> {
  return unwrapResult(await commands.themeResolve(id, artworkKey));
}

export async function duplicateTheme(
  sourceId: string,
  name: string,
): Promise<ThemeSummary> {
  return unwrapResult(await commands.themeDuplicate(sourceId, name));
}

export async function saveThemeEdits(
  id: string,
  name: string,
  tokens: Record<string, ThemeTokenValue>,
): Promise<ThemeSummary> {
  return unwrapResult(await commands.themeSaveEdits(id, name, tokens));
}

export async function importTheme(
  json: string,
  replace = false,
): Promise<ThemeSummary> {
  return unwrapResult(await commands.themeImport(json, replace));
}

export async function exportTheme(id: string): Promise<string> {
  return unwrapResult(await commands.themeExport(id));
}

export async function deleteTheme(id: string): Promise<ThemeSelectionDto> {
  return unwrapResult(await commands.themeDelete(id));
}

export async function getThemeSelection(): Promise<ThemeSelectionDto> {
  return unwrapResult(await commands.themeSelection());
}

export async function setThemeSelection(
  appearance: ThemeAppearance,
  id: string,
  followSystemAppearance: boolean,
): Promise<ThemeSelectionDto> {
  return unwrapResult(
    await commands.themeSetSelection(appearance, id, followSystemAppearance),
  );
}

export function getThemeTokenRegistry(): Promise<ThemeTokenDescriptor[]> {
  return commands.themeTokenRegistry();
}

export function onLibraryScanProgress(
  handler: (event: LibraryScanEvent) => void,
): Promise<UnlistenFn> {
  return events.libraryScanProgress.listen((event) => {
    handler(event.payload);
  });
}

export function onLibraryChanged(
  handler: (event: LibraryChangedEvent) => void,
): Promise<UnlistenFn> {
  return events.libraryChanged.listen((event) => {
    handler(event.payload);
  });
}

export async function getPlayerState(): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerGetState());
}

export async function playCollection(
  trackIds: string[],
  startTrackId: string,
  mode: QueueInsertMode = "replace",
): Promise<PlayerSnapshot> {
  return unwrapResult(
    await commands.playerPlayCollection(trackIds, startTrackId, mode),
  );
}

export async function pausePlayback(): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerPause());
}

export async function resumePlayback(): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerResume());
}

export async function seekPlayback(
  positionMs: number,
): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerSeek(positionMs));
}

export async function nextTrack(): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerNext());
}

export async function previousTrack(): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerPrevious());
}

export async function setPlaybackVolume(
  volume: number,
): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerSetVolume(volume));
}

export async function setPlaybackShuffle(
  enabled: boolean,
): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerSetShuffle(enabled));
}

export async function setPlaybackRepeat(
  repeat: RepeatMode,
): Promise<PlayerSnapshot> {
  return unwrapResult(await commands.playerSetRepeat(repeat));
}

export async function listPlaylists(): Promise<PlaylistCatalog> {
  return unwrapResult(await commands.playlistsList());
}

export async function createPlaylist(draft: PlaylistDraft): Promise<Playlist> {
  return unwrapResult(await commands.playlistsCreate(draft));
}

export async function updatePlaylist(playlist: Playlist): Promise<Playlist> {
  return unwrapResult(await commands.playlistsUpdate(playlist));
}

export async function removePlaylist(id: string): Promise<void> {
  unwrapResult(await commands.playlistsDelete(id));
}

export async function resolvePlaylist(id: string): Promise<ResolvedPlaylist> {
  return unwrapResult(await commands.playlistsResolve(id));
}

export async function setFavorite(
  trackId: string,
  value: boolean,
): Promise<HistoryEvent> {
  const event = unwrapResult(await commands.favoriteSet(trackId, value));
  window.dispatchEvent(new CustomEvent("basis:library-projection-changed"));
  return event;
}

export function onPlayerState(
  handler: (event: PlayerStateEvent) => void,
): Promise<UnlistenFn> {
  return events.playerState.listen((event) => handler(event.payload));
}

export function onPlayerTrackChanged(
  handler: (event: PlayerTrackChangedEvent) => void,
): Promise<UnlistenFn> {
  return events.playerTrackChanged.listen((event) => handler(event.payload));
}

export function onPlayerQueueChanged(
  handler: (event: PlayerQueueChangedEvent) => void,
): Promise<UnlistenFn> {
  return events.playerQueueChanged.listen((event) => handler(event.payload));
}

export function onPlayerError(
  handler: (event: PlayerErrorEvent) => void,
): Promise<UnlistenFn> {
  return events.playerError.listen((event) => handler(event.payload));
}

function unwrapResult<T>(
  result:
    | {
        status: "ok";
        data: T;
      }
    | {
        status: "error";
        error: string;
      },
): T {
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}
