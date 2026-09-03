import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LocateFixed,
  Music2,
  RefreshCw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ArtworkPlaceholder } from "../components/library/ArtworkPlaceholder";
import { displayTrackTitle } from "../components/library/format";
import { usePlayer } from "../components/player/PlayerContext";
import { Button, InlineStatus } from "../components/ui";
import { chooseLyricsCandidate, resolveLyrics } from "../lib/tauri";
import type { LyricsCandidate, LyricsResolution } from "../lib/types";

export function NowPlaying() {
  const navigate = useNavigate();
  const player = usePlayer();
  const { snapshot } = player;
  const track = snapshot?.currentTrack?.track;
  const [resolution, setResolution] = useState<LyricsResolution | null>(null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [following, setFollowing] = useState(true);
  const [lyricsVisible, setLyricsVisible] = useState(readLyricsPreference);
  const lineRefs = useRef(new Map<number, HTMLButtonElement>());
  const lyricsScrollRef = useRef<HTMLDivElement>(null);
  const programmaticScroll = useRef(false);
  const scrollTimer = useRef<number | null>(null);

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
    const position = snapshot?.positionMs ?? 0;
    let active = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].timestampMs > position) break;
      active = index;
    }
    return active;
  }, [resolution?.document?.lines, snapshot?.positionMs]);

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
  const instrumental = resolution?.document?.instrumental === true;
  const showLyrics = lyricsVisible && !instrumental;
  const setManualLyricsVisibility = (visible: boolean) => {
    setLyricsVisible(visible);
    writeLyricsPreference(visible);
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
          className="now-playing-track"
          aria-labelledby="now-playing-title"
        >
          <ArtworkPlaceholder
            className="now-playing-artwork"
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
              {!following && resolution?.document?.synced && (
                <button type="button" onClick={() => setFollowing(true)}>
                  <LocateFixed aria-hidden="true" size={16} /> Resume follow
                </button>
              )}
            </div>
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
                      onClick={() => void player.seek(line.timestampMs)}
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
                      onChoose={(candidateId) => {
                        setLoadingLyrics(true);
                        setLyricsError(null);
                        void chooseLyricsCandidate(track.id, candidateId)
                          .then(setResolution)
                          .catch((cause: unknown) =>
                            setLyricsError(messageFrom(cause)),
                          )
                          .finally(() => setLoadingLyrics(false));
                      }}
                    />
                  )}
                </div>
              ) : resolution?.candidates.length ? (
                <LyricsCandidates
                  candidates={resolution.candidates}
                  message={resolution.message}
                  onChoose={(candidateId) => {
                    setLoadingLyrics(true);
                    setLyricsError(null);
                    void chooseLyricsCandidate(track.id, candidateId)
                      .then(setResolution)
                      .catch((cause: unknown) =>
                        setLyricsError(messageFrom(cause)),
                      )
                      .finally(() => setLoadingLyrics(false));
                  }}
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

function LyricsCandidates({
  candidates,
  message,
  onChoose,
}: {
  candidates: LyricsCandidate[];
  message: string | null;
  onChoose: (candidateId: number) => void;
}) {
  return (
    <div className="lyrics-candidates">
      {message && <p>{message}</p>}
      {candidates.map((candidate) => (
        <button
          type="button"
          key={candidate.id}
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
            {candidate.hasSyncedLyrics ? " · Synced" : " · Plain"}
          </span>
          <span className="lyrics-candidate-reasons">
            {candidate.reasons.join(" · ")}
          </span>
        </button>
      ))}
    </div>
  );
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

function writeLyricsPreference(visible: boolean) {
  try {
    window.localStorage.setItem(LYRICS_VISIBILITY_KEY, String(visible));
  } catch {
    // A privacy-restricted WebView may deny storage; the in-memory preference
    // remains valid for this session.
  }
}
