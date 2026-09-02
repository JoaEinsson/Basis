import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchLibrary } from "../../lib/tauri";
import type { GlobalSearchResults } from "../../lib/types";
import { useNavigationStore } from "../../stores/navigation";
import { useLibraryContext } from "../shell/LibraryContext";
import { Badge, Dialog, InlineStatus, SearchInput } from "../ui";

type PaletteItem = {
  id: string;
  label: string;
  detail: string;
  run: () => void;
};

export function CommandPalette() {
  const navigate = useNavigate();
  const { library, views } = useLibraryContext();
  const open = useNavigationStore((state) => state.paletteOpen);
  const setOpen = useNavigationStore((state) => state.setPaletteOpen);
  const [input, setInput] = useState("");
  const [searchResults, setSearchResults] =
    useState<GlobalSearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setInput("");
    setSearchResults(null);
    setSearchError(null);
    setSearching(false);
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open || library === null || input.trim().length < 2) {
      setSearchResults(null);
      setSearchError(null);
      setSearching(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchLibrary({ input, limitPerSection: 4 })
        .then((results) => {
          if (active) setSearchResults(results);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setSearchResults(null);
          setSearchError(
            cause instanceof Error ? cause.message : "Search failed.",
          );
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [input, library, open]);

  const items = useMemo<PaletteItem[]>(() => {
    const normalized = input.trim().toLocaleLowerCase();
    const matches = (value: string) =>
      normalized.length === 0 || fuzzyScore(value, normalized) >= 0;
    const closeAnd = (run: () => void) => () => {
      setOpen(false);
      run();
    };
    const result: PaletteItem[] = [];

    if (matches("Search library")) {
      result.push({
        id: "action-search",
        label: "Search library",
        detail: "Action",
        run: closeAnd(() =>
          navigate(`/search${input ? `?q=${encodeURIComponent(input)}` : ""}`),
        ),
      });
    }
    if (matches("Playlists")) {
      result.push({
        id: "action-playlists",
        label: "Playlists",
        detail: "Action",
        run: closeAnd(() => navigate("/playlists")),
      });
    }
    for (const view of views.filter((view) => matches(view.name))) {
      result.push({
        id: `view-${view.id}`,
        label: view.name,
        detail: "View",
        run: closeAnd(() =>
          navigate(
            view.id === "builtin:home"
              ? "/home"
              : `/views/${encodeURIComponent(view.id)}`,
          ),
        ),
      });
    }
    for (const artist of searchResults?.artists ?? []) {
      result.push({
        id: `artist-${artist.artistKey}`,
        label: artist.name,
        detail: "Artist",
        run: closeAnd(() => navigate(`/artists/${artist.artistKey}`)),
      });
    }
    for (const album of searchResults?.albums ?? []) {
      result.push({
        id: `album-${album.albumKey}`,
        label: album.title,
        detail: `Album · ${album.albumArtist}`,
        run: closeAnd(() => navigate(`/albums/${album.albumKey}`)),
      });
    }
    for (const track of searchResults?.tracks ?? []) {
      result.push({
        id: `track-${track.id}`,
        label: track.title ?? track.relPath,
        detail: `Track · ${track.artist ?? "Unknown artist"}`,
        run: closeAnd(() =>
          navigate(
            `/search?q=${encodeURIComponent(track.title ?? track.relPath)}`,
          ),
        ),
      });
    }
    for (const playlist of searchResults?.playlists ?? []) {
      result.push({
        id: `playlist-${playlist.id}`,
        label: playlist.name,
        detail: "Playlist",
        run: closeAnd(() => navigate(`/playlists/${playlist.id}`)),
      });
    }
    return result.slice(0, 16);
  }, [input, navigate, searchResults, setOpen, views]);

  useEffect(() => {
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, items.length - 1)),
    );
  }, [items.length]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <Dialog
      className="command-palette"
      ariaLabel="Command palette"
      initialFocusRef={inputRef}
      onClose={() => setOpen(false)}
    >
      <label className="palette-input">
        <Search aria-hidden="true" size={18} />
        <span className="sr-only">Find a View, entity, or action</span>
        <SearchInput
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) =>
                Math.min(Math.max(0, items.length - 1), current + 1),
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(0, current - 1));
            } else if (event.key === "Home") {
              event.preventDefault();
              setActiveIndex(0);
            } else if (event.key === "End") {
              event.preventDefault();
              setActiveIndex(Math.max(0, items.length - 1));
            } else if (event.key === "Enter" && items[activeIndex]) {
              event.preventDefault();
              items[activeIndex].run();
            }
          }}
          placeholder="Find a View, entity, or action"
          role="combobox"
          aria-controls="palette-results"
          aria-expanded="true"
          aria-activedescendant={items[activeIndex]?.id}
        />
        <kbd>Esc</kbd>
      </label>
      <div
        className="palette-results"
        id="palette-results"
        role="listbox"
        aria-busy={searching}
      >
        {items.map((item, index) => (
          <button
            ref={(element) => {
              if (index === activeIndex) activeItemRef.current = element;
            }}
            id={item.id}
            key={item.id}
            className="palette-result"
            data-active={index === activeIndex || undefined}
            role="option"
            aria-selected={index === activeIndex}
            type="button"
            onMouseMove={() => setActiveIndex(index)}
            onClick={item.run}
          >
            <span>{highlightMatch(item.label, input)}</span>
            <Badge>{item.detail}</Badge>
          </button>
        ))}
        {searching && <InlineStatus>Searching library…</InlineStatus>}
        {searchError && <InlineStatus tone="error">{searchError}</InlineStatus>}
        {!searching && !searchError && items.length === 0 && (
          <p className="quiet-state">No matching command.</p>
        )}
      </div>
    </Dialog>
  );
}

function highlightMatch(label: string, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return label;
  const directIndex = label.toLocaleLowerCase().indexOf(normalized);
  if (directIndex >= 0) {
    return (
      <>
        {label.slice(0, directIndex)}
        <mark>{label.slice(directIndex, directIndex + normalized.length)}</mark>
        {label.slice(directIndex + normalized.length)}
      </>
    );
  }
  let queryIndex = 0;
  return Array.from(label).map((character, index) => {
    const match = character.toLocaleLowerCase() === normalized[queryIndex];
    if (match) queryIndex += 1;
    return match ? <mark key={index}>{character}</mark> : character;
  });
}

function fuzzyScore(value: string, normalizedQuery: string) {
  const candidate = value.toLocaleLowerCase();
  let queryIndex = 0;
  let score = 0;
  let previousMatch = -2;
  for (
    let index = 0;
    index < candidate.length && queryIndex < normalizedQuery.length;
    index += 1
  ) {
    if (candidate[index] !== normalizedQuery[queryIndex]) continue;
    score += previousMatch === index - 1 ? 3 : 1;
    if (index === 0 || /[\s/:_-]/.test(candidate[index - 1] ?? "")) score += 2;
    previousMatch = index;
    queryIndex += 1;
  }
  return queryIndex === normalizedQuery.length ? score : -1;
}
