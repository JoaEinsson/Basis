import {
  ArrowLeft,
  ArrowRight,
  Command,
  FolderOpen,
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
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
  useSearchParams,
} from "react-router-dom";
import {
  chooseLibraryRoot,
  getLibraryStatus,
  listViews,
  onLibraryChanged,
  onLibraryScanProgress,
} from "../../lib/tauri";
import type {
  LibraryScanEvent,
  LibrarySummary,
  ViewDefinition,
} from "../../lib/types";
import { useNavigationStore } from "../../stores/navigation";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { BasisMark } from "../brand/BasisMark";
import { CommandPalette } from "../command-palette/CommandPalette";
import { PlayerBar } from "../player/PlayerBar";
import {
  PlayerKeyboardShortcuts,
  PlayerProvider,
} from "../player/PlayerContext";
import { QueuePane } from "../player/QueuePane";
import {
  IconButton,
  InlineStatus,
  MenuItem,
  MenuSurface,
  SearchInput,
  Tooltip,
} from "../ui";
import { LibraryContext } from "./LibraryContext";
import { WindowChrome } from "./WindowChrome";

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
  const routeDirection = useRouteDirection(location.key, location.pathname);

  const refreshViews = useCallback(async () => {
    const next = await listViews();
    setViews(Array.isArray(next) ? next : []);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void onLibraryChanged((event) => {
      if (!active) return;
      setLibrary(event.summary);
      setLibraryError(event.error);
      if (event.kinds.includes("views") || event.kinds.includes("workspace")) {
        void refreshViews().catch((cause: unknown) => {
          if (active) {
            setLibraryError(
              cause instanceof Error
                ? cause.message
                : "Views could not reload.",
            );
          }
        });
      }
      if (event.kinds.includes("audio") || event.kinds.includes("events")) {
        window.dispatchEvent(
          new CustomEvent("basis:library-projection-changed", {
            detail: event,
          }),
        );
      }
      if (event.kinds.includes("playlists")) {
        window.dispatchEvent(
          new CustomEvent("basis:playlists-changed", { detail: event }),
        );
      }
      if (event.kinds.includes("themes") || event.kinds.includes("workspace")) {
        window.dispatchEvent(
          new CustomEvent("basis:themes-changed", { detail: event }),
        );
      }
      if (event.kinds.includes("lyrics")) {
        window.dispatchEvent(
          new CustomEvent("basis:lyrics-changed", { detail: event }),
        );
      }
    }).then((stop) => {
      if (active) unlisten = stop;
      else stop();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [refreshViews]);

  useEffect(() => {
    let active = true;
    void Promise.allSettled([getLibraryStatus(), listViews()]).then(
      ([libraryResult, viewResult]) => {
        if (!active) return;
        if (libraryResult.status === "fulfilled") {
          setLibrary(libraryResult.value);
        } else {
          setLibraryError("Could not restore the music folder.");
        }
        if (
          viewResult.status === "fulfilled" &&
          Array.isArray(viewResult.value)
        ) {
          setViews(viewResult.value);
        } else if (viewResult.status === "rejected") {
          setLibraryError("Could not load library navigation.");
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

  useEffect(() => {
    if (!searchActive) return;
    const frame = window.requestAnimationFrame(() =>
      searchInputRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [searchActive]);

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
  const activeViewId = viewIdForLocation(location.pathname);
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
                <BasisMark />
                <span>Basis</span>
              </Link>
              <div className="history-controls" aria-label="Navigation history">
                <Tooltip label="Back">
                  <IconButton aria-label="Back" onClick={() => navigate(-1)}>
                    <ArrowLeft aria-hidden="true" size={18} />
                  </IconButton>
                </Tooltip>
                <Tooltip label="Forward">
                  <IconButton aria-label="Forward" onClick={() => navigate(1)}>
                    <ArrowRight aria-hidden="true" size={18} />
                  </IconButton>
                </Tooltip>
              </div>
              <PinnedNavigation
                activeViewId={activeViewId}
                overflowViews={overflowViews}
                visibleViews={visibleViews}
                onNavigate={(path) => navigate(path)}
              />
              <WindowChrome>
                <div className="toolbar-actions">
                  {scan !== null &&
                    !scan.progress.complete &&
                    scan.error === null && (
                      <InlineStatus className="inline-scan-status">
                        Indexing {scan.progress.indexed} of{" "}
                        {scan.progress.discovered}
                      </InlineStatus>
                    )}
                  <div
                    className="toolbar-search-shell"
                    data-active={searchActive || undefined}
                  >
                    <Search aria-hidden="true" size={18} />
                    {searchActive ? (
                      <label className="toolbar-search-field">
                        <span className="sr-only">Search library</span>
                        <SearchInput
                          ref={searchInputRef}
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
                        className="toolbar-search-trigger"
                        type="button"
                        aria-label="Search"
                        onClick={() => navigate("/search")}
                      >
                        <span>Search</span>
                      </button>
                    )}
                  </div>
                  <ToolbarMenu ariaLabel="Application menu" align="end">
                    {(close) => (
                      <>
                        <MenuItem
                          onClick={() => {
                            close();
                            setPaletteOpen(true);
                          }}
                        >
                          <Command aria-hidden="true" size={16} /> Command
                          palette
                          <kbd>Ctrl K</kbd>
                        </MenuItem>
                        <MenuItem
                          disabled={choosingLibrary}
                          onClick={() => {
                            close();
                            void chooseLibrary();
                          }}
                        >
                          <FolderOpen aria-hidden="true" size={16} />
                          {choosingLibrary
                            ? "Opening…"
                            : library
                              ? "Change music folder…"
                              : "Add music folder…"}
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close();
                            navigate("/settings");
                          }}
                        >
                          <Settings2 aria-hidden="true" size={16} /> Settings
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            close();
                            navigate("/playlists");
                          }}
                        >
                          Playlists
                        </MenuItem>
                      </>
                    )}
                  </ToolbarMenu>
                </div>
              </WindowChrome>
            </header>

            <div className="shell-workspace">
              <main className="main-canvas" ref={canvasRef} tabIndex={-1}>
                {libraryError && location.pathname !== "/onboarding" && (
                  <div className="shell-error-banner" role="alert">
                    <span>{libraryError}</span>
                    <button
                      type="button"
                      disabled={choosingLibrary}
                      onClick={() => void chooseLibrary()}
                    >
                      Choose folder
                    </button>
                  </div>
                )}
                <div
                  className="route-stage"
                  data-direction={routeDirection}
                  key={location.pathname}
                >
                  <Outlet />
                </div>
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

function PinnedNavigation({
  activeViewId,
  onNavigate,
  overflowViews,
  visibleViews,
}: {
  activeViewId: string | null;
  onNavigate: (path: string) => void;
  overflowViews: ViewDefinition[];
  visibleViews: ViewDefinition[];
}) {
  const navigationRef = useRef<HTMLElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const activeIndex = visibleViews.findIndex(
    (view) => view.id === activeViewId,
  );
  const overflowActive = overflowViews.some((view) => view.id === activeViewId);

  useLayoutEffect(() => {
    const measure = () => {
      const link = linkRefs.current[activeIndex];
      if (!link) {
        setIndicator({ left: 0, width: 0 });
        return;
      }
      setIndicator({ left: link.offsetLeft, width: link.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === "undefined" || !navigationRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(navigationRef.current);
    return () => observer.disconnect();
  }, [activeIndex, visibleViews]);

  return (
    <nav
      ref={navigationRef}
      className="primary-navigation"
      aria-label="Library Views"
      data-has-active={activeIndex >= 0 || undefined}
      style={
        {
          "--mv-navigation-indicator-left": `${indicator.left}px`,
          "--mv-navigation-indicator-width": `${indicator.width}px`,
        } as CSSProperties
      }
    >
      <span className="primary-navigation-indicator" aria-hidden="true" />
      {visibleViews.map((view, index) => (
        <NavLink
          ref={(element) => {
            linkRefs.current[index] = element;
          }}
          key={view.id}
          to={viewPath(view.id)}
        >
          {view.name}
        </NavLink>
      ))}
      {overflowViews.length > 0 && (
        <ToolbarMenu active={overflowActive} ariaLabel="More library Views">
          {(close) => (
            <>
              {overflowViews.map((view) => (
                <MenuItem
                  key={view.id}
                  data-active={view.id === activeViewId || undefined}
                  onClick={() => {
                    close();
                    onNavigate(viewPath(view.id));
                  }}
                >
                  {view.name}
                </MenuItem>
              ))}
            </>
          )}
        </ToolbarMenu>
      )}
    </nav>
  );
}

function ToolbarMenu({
  active,
  align = "start",
  ariaLabel,
  children,
}: {
  active?: boolean;
  align?: "end" | "start";
  ariaLabel: string;
  children: (close: () => void) => ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const close = () => setPosition(null);
  const toggle = () => {
    if (position) {
      close();
      return;
    }
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPosition({
      x: align === "end" ? bounds.right : bounds.left,
      y: bounds.bottom + 4,
    });
  };

  return (
    <span className="toolbar-menu">
      <Tooltip label={ariaLabel}>
        <IconButton
          ref={triggerRef}
          aria-label={ariaLabel}
          aria-haspopup="menu"
          aria-expanded={position !== null}
          data-active={active || undefined}
          onClick={toggle}
        >
          <MoreHorizontal aria-hidden="true" size={19} />
        </IconButton>
      </Tooltip>
      {position && (
        <MenuSurface
          align={align}
          ariaLabel={ariaLabel}
          position={position}
          onClose={close}
        >
          {children(close)}
        </MenuSurface>
      )}
    </span>
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

function viewIdForLocation(pathname: string) {
  if (pathname === "/home") return "builtin:home";
  if (!pathname.startsWith("/views/")) return null;
  try {
    return decodeURIComponent(pathname.slice("/views/".length));
  } catch {
    return pathname.slice("/views/".length);
  }
}

function useRouteDirection(historyKey: string, pathname: string) {
  const navigationType = useNavigationType();
  const state = useRef({
    direction: "none" as "back" | "forward" | "none",
    index: 0,
    key: historyKey,
    keys: [historyKey],
    pathname,
  });
  const current = state.current;
  if (current.key !== historyKey) {
    const previousPathname = current.pathname;
    const existing = current.keys.indexOf(historyKey);
    if (existing >= 0) {
      current.direction =
        pathname === previousPathname
          ? "none"
          : existing < current.index
            ? "back"
            : "forward";
      current.index = existing;
    } else if (navigationType === "REPLACE") {
      current.keys[current.index] = historyKey;
      current.direction = "none";
    } else {
      current.keys.splice(current.index + 1);
      current.keys.push(historyKey);
      current.index = current.keys.length - 1;
      current.direction = pathname === previousPathname ? "none" : "forward";
    }
    current.key = historyKey;
    current.pathname = pathname;
  }
  return current.direction;
}

function useCanvasRestoration(
  canvasRef: React.RefObject<HTMLElement | null>,
  historyKey: string,
) {
  const saveScroll = useNavigationStore((state) => state.saveScroll);
  const saveFocus = useNavigationStore((state) => state.saveFocus);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const navigation = useNavigationStore.getState();
    const savedPosition = navigation.scrollPositions[historyKey] ?? 0;
    const savedFocus = navigation.focusTargets[historyKey] ?? null;
    let restored = savedPosition === 0;
    const restore = () => {
      if (!restored) {
        canvas.scrollTop = savedPosition;
        restored =
          canvas.scrollTop === savedPosition ||
          canvas.scrollHeight - canvas.clientHeight >= savedPosition;
      }
    };
    const frame = window.requestAnimationFrame(() => {
      restore();
      restoreFocus(canvas, savedFocus);
    });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        restore();
        if (restored) observer?.disconnect();
      });
      observer.observe(canvas);
    }
    const stop = window.setTimeout(() => observer?.disconnect(), 2000);
    const rememberFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        saveFocus(historyKey, focusTargetFor(target));
      }
    };
    canvas.addEventListener("focusin", rememberFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(stop);
      observer?.disconnect();
      canvas.removeEventListener("focusin", rememberFocus);
      const active = document.activeElement;
      if (active instanceof HTMLElement && canvas.contains(active)) {
        saveFocus(historyKey, focusTargetFor(active));
      }
      saveScroll(historyKey, canvas.scrollTop);
    };
  }, [canvasRef, historyKey, saveFocus, saveScroll]);
}

function focusTargetFor(element: HTMLElement) {
  for (const attribute of [
    "id",
    "data-focus-key",
    "href",
    "aria-label",
  ] as const) {
    const value = element.getAttribute(attribute);
    if (value) return { attribute, value };
  }
  return null;
}

function restoreFocus(
  canvas: HTMLElement,
  target: ReturnType<typeof focusTargetFor>,
) {
  if (!target) return;
  const match = Array.from(
    canvas.querySelectorAll<HTMLElement>(`[${target.attribute}]`),
  ).find((element) => element.getAttribute(target.attribute) === target.value);
  match?.focus({ preventScroll: true });
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
