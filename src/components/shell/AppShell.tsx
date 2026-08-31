import {
  ArrowLeft,
  ArrowRight,
  Command,
  MoreHorizontal,
  Search,
  Settings2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  chooseLibraryRoot,
  getLibraryStatus,
  listViews,
  onLibraryScanProgress,
} from "../../lib/tauri";
import type {
  LibraryScanEvent,
  LibrarySummary,
  ViewDefinition,
} from "../../lib/types";
import { useNavigationStore } from "../../stores/navigation";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { CommandPalette } from "../command-palette/CommandPalette";
import { PlayerBar } from "../player/PlayerBar";
import {
  PlayerKeyboardShortcuts,
  PlayerProvider,
} from "../player/PlayerContext";
import { QueuePane } from "../player/QueuePane";
import { LibraryContext } from "./LibraryContext";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [library, setLibrary] = useState<LibrarySummary | null>(null);
  const [scan, setScan] = useState<LibraryScanEvent | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [views, setViews] = useState<ViewDefinition[]>([]);
  const [choosingLibrary, setChoosingLibrary] = useState(false);
  const canvasRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const setPaletteOpen = useNavigationStore((state) => state.setPaletteOpen);
  const visibleViewCount = useVisibleViewCount();
  const searchActive = location.pathname === "/search";

  const refreshViews = useCallback(async () => {
    const next = await listViews();
    setViews(Array.isArray(next) ? next : []);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([getLibraryStatus(), listViews()]).then(
      ([libraryResult, viewResult]) => {
        if (!active) return;
        if (libraryResult.status === "fulfilled") {
          setLibrary(libraryResult.value);
        }
        if (
          viewResult.status === "fulfilled" &&
          Array.isArray(viewResult.value)
        ) {
          setViews(viewResult.value);
        }
      },
    );
    let unlisten: (() => void) | undefined;
    void onLibraryScanProgress((event) => {
      if (!active) return;
      setScan(event);
      setLibrary(event.summary);
      setLibraryError(event.error);
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const editable = isEditable(event.target);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") ||
        (event.key === "/" && !editable)
      ) {
        event.preventDefault();
        if (!searchActive) navigate("/search");
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [navigate, searchActive, setPaletteOpen]);

  useCanvasRestoration(canvasRef, location.key);

  const chooseLibrary = useCallback(async () => {
    setChoosingLibrary(true);
    setLibraryError(null);
    try {
      const selected = await chooseLibraryRoot();
      if (selected === null) return;
      setLibrary(selected);
      setScan({
        summary: selected,
        progress: {
          discovered: 0,
          indexed: 0,
          skippedUnchanged: 0,
          failed: 0,
          currentPath: null,
          currentTitle: null,
          complete: false,
        },
        error: null,
      });
      await refreshViews();
      navigate("/home");
    } catch (error) {
      setLibraryError(
        error instanceof Error
          ? error.message
          : "Basis could not open the selected music folder.",
      );
    } finally {
      setChoosingLibrary(false);
    }
  }, [navigate, refreshViews]);

  const context = useMemo(
    () => ({
      library,
      scan,
      libraryError,
      views,
      choosingLibrary,
      chooseLibrary,
      refreshViews,
      replaceViews: setViews,
    }),
    [
      chooseLibrary,
      choosingLibrary,
      library,
      libraryError,
      refreshViews,
      scan,
      views,
    ],
  );
  const pinnedViews = views.filter((view) => view.pin_to_sidebar);
  const visibleViews = pinnedViews.slice(0, visibleViewCount);
  const overflowViews = pinnedViews.slice(visibleViewCount);

  return (
    <LibraryContext.Provider value={context}>
      <ThemeProvider enabled={library !== null}>
        <PlayerProvider>
          <div className="app-shell">
            <header className="app-toolbar">
              <Link
                className="brand-lockup"
                to="/home"
                aria-label="Basis library"
              >
                <span className="brand-mark" aria-hidden="true">
                  B
                </span>
                <span>Basis</span>
              </Link>
              <div className="history-controls" aria-label="Navigation history">
                <button
                  type="button"
                  aria-label="Back"
                  onClick={() => navigate(-1)}
                >
                  <ArrowLeft aria-hidden="true" size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Forward"
                  onClick={() => navigate(1)}
                >
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </div>
              <nav className="primary-navigation" aria-label="Library Views">
                {visibleViews.map((view) => (
                  <NavLink key={view.id} to={viewPath(view.id)}>
                    {view.name}
                  </NavLink>
                ))}
                {overflowViews.length > 0 && (
                  <details className="toolbar-menu">
                    <summary aria-label="More library Views">
                      <MoreHorizontal aria-hidden="true" size={19} />
                    </summary>
                    <div className="menu-popover" role="menu">
                      {overflowViews.map((view) => (
                        <NavLink
                          role="menuitem"
                          key={view.id}
                          to={viewPath(view.id)}
                        >
                          {view.name}
                        </NavLink>
                      ))}
                    </div>
                  </details>
                )}
              </nav>
              <div className="toolbar-actions">
                {scan !== null &&
                  !scan.progress.complete &&
                  scan.error === null && (
                    <span className="inline-scan-status" aria-live="polite">
                      Indexing {scan.progress.indexed} of{" "}
                      {scan.progress.discovered}
                    </span>
                  )}
                {searchActive ? (
                  <label className="toolbar-search">
                    <Search aria-hidden="true" size={17} />
                    <span className="sr-only">Search library</span>
                    <input
                      ref={searchInputRef}
                      autoFocus
                      value={searchParams.get("q") ?? ""}
                      onChange={(event) => {
                        const query = event.target.value;
                        navigate(
                          query
                            ? `/search?q=${encodeURIComponent(query)}`
                            : "/search",
                          {
                            replace: true,
                          },
                        );
                      }}
                      placeholder="Search library"
                    />
                    <kbd>Esc</kbd>
                  </label>
                ) : (
                  <button
                    className="toolbar-icon-label"
                    type="button"
                    onClick={() => navigate("/search")}
                  >
                    <Search aria-hidden="true" size={18} />
                    <span>Search</span>
                  </button>
                )}
                <details className="toolbar-menu application-menu">
                  <summary aria-label="Application menu">
                    <MoreHorizontal aria-hidden="true" size={19} />
                  </summary>
                  <div className="menu-popover menu-popover-end" role="menu">
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => setPaletteOpen(true)}
                    >
                      <Command aria-hidden="true" size={16} /> Command palette
                      <kbd>Ctrl K</kbd>
                    </button>
                    <Link role="menuitem" to="/settings">
                      <Settings2 aria-hidden="true" size={16} /> Settings
                    </Link>
                    <Link role="menuitem" to="/playlists">
                      Playlists
                    </Link>
                  </div>
                </details>
              </div>
            </header>

            <div className="shell-workspace">
              <main className="main-canvas" ref={canvasRef} tabIndex={-1}>
                <Outlet />
              </main>
              <QueuePane />
            </div>
            <PlayerBar />
            <PlayerKeyboardShortcuts />
            <CommandPalette />
          </div>
        </PlayerProvider>
      </ThemeProvider>
    </LibraryContext.Provider>
  );
}

function useVisibleViewCount() {
  const [count, setCount] = useState(() =>
    viewCountForWidth(window.innerWidth),
  );
  useEffect(() => {
    const update = () => setCount(viewCountForWidth(window.innerWidth));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return count;
}

function viewCountForWidth(width: number) {
  if (width >= 1200) return 6;
  if (width >= 800) return 3;
  return 0;
}

function viewPath(id: string) {
  return id === "builtin:home" ? "/home" : `/views/${encodeURIComponent(id)}`;
}

function useCanvasRestoration(
  canvasRef: React.RefObject<HTMLElement | null>,
  historyKey: string,
) {
  const savedPosition = useNavigationStore(
    (state) => state.scrollPositions[historyKey] ?? 0,
  );
  const saveScroll = useNavigationStore((state) => state.saveScroll);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const restore = () => {
      if (savedPosition > 0) canvas.scrollTop = savedPosition;
    };
    restore();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(restore);
      observer.observe(canvas);
    }
    const stop = window.setTimeout(() => observer?.disconnect(), 2000);
    return () => {
      window.clearTimeout(stop);
      observer?.disconnect();
      saveScroll(historyKey, canvas.scrollTop);
    };
  }, [canvasRef, historyKey, saveScroll, savedPosition]);
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
