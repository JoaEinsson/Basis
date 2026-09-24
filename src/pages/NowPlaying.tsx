import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LocateFixed,
  Minus,
  Music2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ArtworkPlaceholder } from "../components/library/ArtworkPlaceholder";
import { displayTrackTitle } from "../components/library/format";
import { usePlayer } from "../components/player/PlayerContext";
import { Button, InlineStatus } from "../components/ui";
import {
  chooseLyricsCandidate,
  clearLyricsSelection,
  resolveLyrics,
  searchLyrics,
  setLyricsOffset,
} from "../lib/tauri";
import type {
  LyricsCandidate,
  LyricsResolution,
  LyricsSearchQuery,
} from "../lib/types";

export function NowPlaying() {
  const navigate = useNavigate();
  const player = usePlayer();
  const { snapshot } = player;
  const track = snapshot?.currentTrack?.track;
  const [resolution, setResolution] = useState<LyricsResolution | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [manualResults, setManualResults] = useState<LyricsResolution | null>(
    null,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [lyricsActionBusy, setLyricsActionBusy] = useState(false);
  const [lyricsActionError, setLyricsActionError] = useState<string | null>(
    null,
  );
  const [following, setFollowing] = useState(true);
  const [lyricsVisible, setLyricsVisible] = useState(readLyricsPreference);
  const lineRefs = useRef(new Map<number, HTMLButtonElement>());
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);
  const scrollTimer = useRef<number | null>(null);
  const trackSectionRef = useRef<HTMLElement>(null);
  const artworkPositionRef = useRef<DOMRect | null>(null);
  const artworkTrackIdRef = useRef<string | null>(null);
  const artworkAnimationRef = useRef<Animation | null>(null);

  useEffect(() => {
    const reload = () => setRequestVersion((version) => version + 1);
    window.addEventListener("basis:lyrics-changed", reload);
    return () => window.removeEventListener("basis:lyrics-changed", reload);
  }, []);

  useEffect(() => {
    if (!track) {
      setResolution(null);
      setLyricsError(null);
      setLoadingLyrics(false);
      return;
    }
    let active = true;
    setLoadingLyrics(true);
    setLyricsError(null);
    setResolution(null);
    setManualResults(null);
    setSearchOpen(false);
    setLyricsActionError(null);
    setFollowing(true);
    void resolveLyrics(track.id, true)
      .then((next) => {
        if (active) setResolution(next);
      })
      .catch((cause: unknown) => {
        if (active) setLyricsError(messageFrom(cause));
      })
      .finally(() => {
        if (active) setLoadingLyrics(false);
      });
    return () => {
      active = false;
    };
  }, [requestVersion, track?.id]);

  const activeLine = useMemo(() => {
    const lines = resolution?.document?.lines ?? [];
    const position = (snapshot?.positionMs ?? 0) - (resolution?.offsetMs ?? 0);
    let active = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].timestampMs > position) break;
      active = index;
    }
    return active;
  }, [resolution?.document?.lines, resolution?.offsetMs, snapshot?.positionMs]);

  useEffect(() => {
    if (!following || activeLine < 0) return;
    const line = lineRefs.current.get(activeLine);
    if (!line) return;
    programmaticScroll.current = true;
    const behavior =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
    const narrow =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1199px)").matches;
    if (narrow && typeof line.scrollIntoView === "function") {
      line.scrollIntoView({ block: "center", behavior });
    } else {
      const scroller = lyricsScrollRef.current;
      if (scroller && typeof scroller.scrollTo === "function") {
        scroller.scrollTo({
          top:
            line.offsetTop -
            Math.max(0, (scroller.clientHeight - line.offsetHeight) / 2),
          behavior,
        });
      }
    }
    if (scrollTimer.current !== null) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      programmaticScroll.current = false;
    }, 700);
    return () => {
      if (scrollTimer.current !== null)
        window.clearTimeout(scrollTimer.current);
    };
  }, [activeLine, following]);

  const instrumental = resolution?.document?.instrumental === true;
  const showLyrics = lyricsVisible && !instrumental;
  const trackId = track?.id ?? null;

  useLayoutEffect(() => {
    const section = trackSectionRef.current;
    const artwork = section?.querySelector<HTMLElement>(".now-playing-artwork");
    if (!section || !artwork || !trackId) return;

    const nextPosition = artwork.getBoundingClientRect();
    const previousPosition = artworkPositionRef.current;
    artworkPositionRef.current = nextPosition;

    if (artworkTrackIdRef.current !== trackId) {
      artworkTrackIdRef.current = trackId;
      return;
    }
    if (!previousPosition || typeof section.animate !== "function") return;

    const deltaX = previousPosition.left - nextPosition.left;
    const deltaY = previousPosition.top - nextPosition.top;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    artworkAnimationRef.current?.cancel();
    const rootStyle = getComputedStyle(document.documentElement);
    const animation = section.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: cssDurationMs(
          rootStyle.getPropertyValue("--mv-motion-shared-artwork"),
          320,
        ),
        easing:
          rootStyle.getPropertyValue("--mv-motion-easing-spring-soft").trim() ||
          "ease",
      },
    );
    artworkAnimationRef.current = animation;
    animation.addEventListener(
      "finish",
      () => {
        if (artworkAnimationRef.current === animation) {
          artworkAnimationRef.current = null;
        }
      },
      { once: true },
    );
  }, [showLyrics, trackId]);

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
  const setManualLyricsVisibility = (visible: boolean) => {
    setLyricsVisible(visible);
    writeLyricsPreference(visible);
  };
  const chooseCandidate = async (candidateId: number) => {
    setLyricsActionBusy(true);
    setLyricsActionError(null);
    try {
      const next = await chooseLyricsCandidate(track.id, candidateId);
      setResolution(next);
      setManualResults(null);
      setSearchOpen(false);
      setFollowing(true);
    } catch (cause) {
      setLyricsActionError(messageFrom(cause));
    } finally {
      setLyricsActionBusy(false);
    }
  };
  const changeOffset = async (offsetMs: number) => {
    setLyricsActionBusy(true);
    setLyricsActionError(null);
    try {
      const preference = await setLyricsOffset(track.id, offsetMs);
      setResolution((current) =>
        current
          ? {
              ...current,
              offsetMs: preference.offsetMs,
              selection: preference.selection,
            }
          : current,
      );
      setFollowing(true);
    } catch (cause) {
      setLyricsActionError(messageFrom(cause));
    } finally {
      setLyricsActionBusy(false);
    }
  };
  const resetSelection = async () => {
    setLyricsActionBusy(true);
    setLyricsActionError(null);
    try {
      setResolution(await clearLyricsSelection(track.id));
      setManualResults(null);
      setFollowing(true);
    } catch (cause) {
      setLyricsActionError(messageFrom(cause));
    } finally {
      setLyricsActionBusy(false);
    }
  };

  return (
    <article className="page now-playing-view">
      <div className="now-playing-toolbar">
        <Button
          className="back-context"
          variant="text"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft aria-hidden="true" size={17} /> Back
        </Button>
        {(player.error || snapshot.error) && (
          <InlineStatus tone="error">
            {player.error ?? snapshot.error}
          </InlineStatus>
        )}
        {!player.error && !snapshot.error && snapshot.status === "loading" && (
          <InlineStatus>Loading track…</InlineStatus>
        )}
        {instrumental ? (
          <Button
            className="lyrics-visibility-toggle"
            disabled
            aria-label="Lyrics unavailable for instrumental track"
          >
            <Music2 aria-hidden="true" size={16} /> Instrumental
          </Button>
        ) : (
          <Button
            className="lyrics-visibility-toggle"
            aria-controls="now-playing-lyrics"
            aria-expanded={showLyrics}
            onClick={() => setManualLyricsVisibility(!lyricsVisible)}
          >
            {showLyrics ? (
              <EyeOff aria-hidden="true" size={16} />
            ) : (
              <Eye aria-hidden="true" size={16} />
            )}
            {showLyrics ? "Hide lyrics" : "Show lyrics"}
          </Button>
        )}
      </div>
      <div
        className="now-playing-layout"
        data-artwork-only={!showLyrics || undefined}
      >
        <section
          key={track.id}
          ref={trackSectionRef}
          className="now-playing-track"
          aria-labelledby="now-playing-title"
        >
          <ArtworkPlaceholder
            className="now-playing-artwork"
            dimension={512}
            title={title}
            artworkKey={track.artworkKey}
            seed={track.relPath}
          />
          <div className="now-playing-metadata">
            <h1 id="now-playing-title">{title}</h1>
            <p>{track.artist ?? "Unknown artist"}</p>
            <p>{track.album ?? "Unknown album"}</p>
            {snapshot.outputDevice && <small>{snapshot.outputDevice}</small>}
            {instrumental && (
              <InlineStatus>
                <Music2 aria-hidden="true" size={14} /> Instrumental track
              </InlineStatus>
            )}
          </div>
        </section>
        {showLyrics && (
          <section
            id="now-playing-lyrics"
            className="lyrics-pane"
            aria-labelledby="lyrics-title"
          >
            <div className="lyrics-heading">
              <h2 id="lyrics-title">Lyrics</h2>
              <div className="lyrics-heading-actions">
                {!following && resolution?.document?.synced && (
                  <button type="button" onClick={() => setFollowing(true)}>
                    <LocateFixed aria-hidden="true" size={16} /> Resume follow
                  </button>
                )}
                <button
                  type="button"
                  aria-expanded={searchOpen}
                  onClick={() => {
                    setSearchOpen((open) => !open);
                    setManualResults(null);
                    setLyricsActionError(null);
                  }}
                >
                  <Search aria-hidden="true" size={16} /> Find lyrics
                </button>
              </div>
            </div>
            {resolution?.document?.synced && (
              <LyricsOffsetControls
                offsetMs={resolution.offsetMs ?? 0}
                busy={lyricsActionBusy}
                onChange={(offsetMs) => void changeOffset(offsetMs)}
              />
            )}
            {resolution?.selection && (
              <div className="lyrics-selection-status">
                <span>
                  Selected LRCLIB match: {resolution.selection.trackName} ·{" "}
                  {resolution.selection.artistName}
                </span>
                <button
                  type="button"
                  disabled={lyricsActionBusy}
                  onClick={() => void resetSelection()}
                >
                  <RotateCcw aria-hidden="true" size={15} /> Use automatic match
                </button>
              </div>
            )}
            {searchOpen && (
              <LyricsSearchForm
                trackName={track.title ?? title}
                artistName={track.artist ?? ""}
                albumName={track.album ?? ""}
                durationSeconds={
                  track.durationMs ? track.durationMs / 1000 : null
                }
                busy={lyricsActionBusy}
                onSearch={async (query) => {
                  setLyricsActionBusy(true);
                  setLyricsActionError(null);
                  try {
                    setManualResults(await searchLyrics(track.id, query));
                  } catch (cause) {
                    setLyricsActionError(messageFrom(cause));
                  } finally {
                    setLyricsActionBusy(false);
                  }
                }}
              />
            )}
            {searchOpen && manualResults && (
              <div className="lyrics-manual-results">
                {manualResults.candidates.length ? (
                  <LyricsCandidates
                    candidates={manualResults.candidates}
                    message={manualResults.message}
                    disabled={lyricsActionBusy}
                    onChoose={(candidateId) =>
                      void chooseCandidate(candidateId)
                    }
                  />
                ) : (
                  <LyricsQuietState
                    message={manualResults.message ?? "No results found"}
                  />
                )}
              </div>
            )}
            {lyricsActionError && (
              <p className="inline-error lyrics-action-error" role="alert">
                {lyricsActionError}
              </p>
            )}
            <div
              className="lyrics-scroll"
              ref={lyricsScrollRef}
              onScroll={() => {
                if (!programmaticScroll.current) setFollowing(false);
              }}
            >
              {loadingLyrics ? (
                <LyricsQuietState message="Fetching lyrics..." />
              ) : lyricsError ? (
                <LyricsQuietState
                  message={lyricsError}
                  retry={() => setRequestVersion((current) => current + 1)}
                />
              ) : resolution?.document?.synced ? (
                <div className="synced-lyrics" aria-live="off">
                  {resolution.document.lines.map((line, index) => (
                    <button
                      className="lyrics-line"
                      data-state={
                        index === activeLine
                          ? "active"
                          : index < activeLine
                            ? "past"
                            : "upcoming"
                      }
                      aria-current={index === activeLine ? "true" : undefined}
                      key={`${line.timestampMs}-${index}`}
                      ref={(element) => {
                        if (element) lineRefs.current.set(index, element);
                        else lineRefs.current.delete(index);
                      }}
                      type="button"
                      onClick={() =>
                        void player.seek(
                          Math.max(
                            0,
                            Math.min(
                              snapshot.durationMs,
                              line.timestampMs + (resolution.offsetMs ?? 0),
                            ),
                          ),
                        )
                      }
                    >
                      {line.text || "♪"}
                    </button>
                  ))}
                </div>
              ) : resolution?.document?.plainText ? (
                <div className="plain-lyrics-stack">
                  <pre className="plain-lyrics">
                    {resolution.document.plainText}
                  </pre>
                  {!!resolution.candidates.length && (
                    <LyricsCandidates
                      candidates={resolution.candidates}
                      message={resolution.message}
                      disabled={lyricsActionBusy}
                      onChoose={(candidateId) =>
                        void chooseCandidate(candidateId)
                      }
                    />
                  )}
                </div>
              ) : resolution?.candidates.length ? (
                <LyricsCandidates
                  candidates={resolution.candidates}
                  message={resolution.message}
                  disabled={lyricsActionBusy}
                  onChoose={(candidateId) => void chooseCandidate(candidateId)}
                />
              ) : (
                <LyricsQuietState
                  message={resolution?.message ?? "Lyrics unavailable"}
                  retry={() => setRequestVersion((current) => current + 1)}
                />
              )}
            </div>
            {resolution?.document &&
              resolution.message &&
              !resolution.candidates.length && (
                <p className="lyrics-notice" role="status">
                  {resolution.message}
                </p>
              )}
          </section>
        )}
      </div>
    </article>
  );
}

function LyricsOffsetControls({
  offsetMs,
  busy,
  onChange,
}: {
  offsetMs: number;
  busy: boolean;
  onChange: (offsetMs: number) => void;
}) {
  return (
    <div className="lyrics-offset-controls">
      <span>Timing: {formatOffset(offsetMs)}</span>
      <div role="group" aria-label="Lyrics synchronization timing">
        <button
          type="button"
          aria-label="Show lyrics half a second earlier"
          disabled={busy || offsetMs <= -15_000}
          onClick={() => onChange(Math.max(-15_000, offsetMs - 500))}
        >
          <Minus aria-hidden="true" size={15} /> Earlier
        </button>
        <button
          type="button"
          disabled={busy || offsetMs === 0}
          onClick={() => onChange(0)}
        >
          <RotateCcw aria-hidden="true" size={15} /> Reset
        </button>
        <button
          type="button"
          aria-label="Show lyrics half a second later"
          disabled={busy || offsetMs >= 15_000}
          onClick={() => onChange(Math.min(15_000, offsetMs + 500))}
        >
          <Plus aria-hidden="true" size={15} /> Later
        </button>
      </div>
    </div>
  );
}

function LyricsSearchForm({
  trackName,
  artistName,
  albumName,
  durationSeconds,
  busy,
  onSearch,
}: {
  trackName: string;
  artistName: string;
  albumName: string;
  durationSeconds: number | null;
  busy: boolean;
  onSearch: (query: LyricsSearchQuery) => void;
}) {
  const [title, setTitle] = useState(trackName);
  const [artist, setArtist] = useState(artistName);
  const [album, setAlbum] = useState(albumName);
  const [duration, setDuration] = useState(
    durationSeconds === null ? "" : String(Math.round(durationSeconds)),
  );
  return (
    <form
      className="lyrics-search-form"
      onSubmit={(event) => {
        event.preventDefault();
        const parsedDuration = duration.trim() ? Number(duration) : null;
        onSearch({
          trackName: title,
          artistName: artist,
          albumName: album.trim() || null,
          durationSeconds:
            parsedDuration !== null && Number.isFinite(parsedDuration)
              ? parsedDuration
              : null,
        });
      }}
    >
      <label>
        Track title
        <input
          value={title}
          maxLength={256}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        Artist
        <input
          value={artist}
          maxLength={256}
          required
          onChange={(event) => setArtist(event.target.value)}
        />
      </label>
      <label>
        Album <small>optional</small>
        <input
          value={album}
          maxLength={256}
          onChange={(event) => setAlbum(event.target.value)}
        />
      </label>
      <label>
        Duration in seconds <small>for comparison</small>
        <input
          type="number"
          min={0}
          max={86_400}
          step="0.1"
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
      </label>
      <button type="submit" disabled={busy || !title.trim() || !artist.trim()}>
        <Search aria-hidden="true" size={16} />
        {busy ? "Searching…" : "Search LRCLIB"}
      </button>
    </form>
  );
}

function LyricsCandidates({
  candidates,
  message,
  onChoose,
  disabled = false,
}: {
  candidates: LyricsCandidate[];
  message: string | null;
  onChoose: (candidateId: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="lyrics-candidates">
      {message && <p>{message}</p>}
      {candidates.map((candidate) => (
        <button
          type="button"
          key={candidate.id}
          disabled={disabled}
          onClick={() => onChoose(candidate.id)}
        >
          <span className="lyrics-candidate-heading">
            <strong>{candidate.trackName}</strong>
            <span data-confidence={candidate.confidence}>
              {candidate.confidence === "high"
                ? "High confidence"
                : "Review match"}
            </span>
          </span>
          <span>
            {candidate.artistName} · {candidate.albumName}
            {candidate.instrumental
              ? " · Instrumental"
              : candidate.hasSyncedLyrics
                ? " · Synced"
                : " · Plain"}
            {Number.isFinite(candidate.durationSeconds) && (
              <> · {formatDuration(candidate.durationSeconds ?? 0)}</>
            )}
          </span>
          <span className="lyrics-candidate-reasons">
            {candidate.reasons.join(" · ")}
          </span>
        </button>
      ))}
    </div>
  );
}

function formatOffset(offsetMs: number) {
  if (offsetMs === 0) return "On time";
  const seconds = Math.abs(offsetMs / 1000).toFixed(1);
  return offsetMs > 0 ? `+${seconds} s (later)` : `-${seconds} s (earlier)`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function LyricsQuietState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="lyrics-unavailable">
      <p>{message}</p>
      {retry && (
        <button type="button" onClick={retry}>
          <RefreshCw aria-hidden="true" size={16} /> Retry
        </button>
      )}
    </div>
  );
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : "Lyrics are unavailable.";
}

const LYRICS_VISIBILITY_KEY = "basis.now-playing.lyrics-visible";

function readLyricsPreference() {
  try {
    return window.localStorage.getItem(LYRICS_VISIBILITY_KEY) !== "false";
  } catch {
    return true;
  }
}

function cssDurationMs(value: string, fallback: number) {
  const normalized = value.trim();
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return fallback;
  return normalized.endsWith("ms") ? amount : amount * 1_000;
}

function writeLyricsPreference(visible: boolean) {
  try {
    window.localStorage.setItem(LYRICS_VISIBILITY_KEY, String(visible));
  } catch {
    // A privacy-restricted WebView may deny storage; the in-memory preference
    // remains valid for this session.
  }
}
