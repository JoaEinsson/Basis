import {
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { displayTrackTitle, formatDuration } from "../library/format";
import { ArtworkPlaceholder } from "../library/ArtworkPlaceholder";
import { usePlayer } from "./PlayerContext";

export function PlayerBar() {
  const navigate = useNavigate();
  const player = usePlayer();
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const snapshot = player.snapshot;
  const current = snapshot?.currentTrack?.track;
  if (!snapshot || !current) return null;

  const title = displayTrackTitle(current.title, current.relPath);
  const duration = Math.max(snapshot.durationMs ?? current.durationMs ?? 0, 0);
  const position = Math.min(scrubbing ?? snapshot.positionMs ?? 0, duration || 0);
  const playing = snapshot.status === "playing";
  const loading = snapshot.status === "loading";

  const commitSeek = () => {
    if (scrubbing === null) return;
    void player.seek(scrubbing);
    setScrubbing(null);
  };

  return (
    <footer className="player-bar" aria-label="Now playing controls">
      <button
        className="player-current-track"
        type="button"
        onClick={() => navigate("/now-playing")}
        aria-label={`Open Now Playing for ${title}`}
      >
        <ArtworkPlaceholder
          className="player-artwork"
          title={title}
          artworkKey={current.artworkKey}
          seed={current.relPath}
        />
        <span className="player-current-copy">
          <strong>{title}</strong>
          <span>{current.artist ?? "Unknown artist"}</span>
        </span>
      </button>

      <div className="player-transport">
        <div className="transport-buttons">
          <button
            type="button"
            aria-label={snapshot.shuffle ? "Disable shuffle" : "Enable shuffle"}
            aria-pressed={snapshot.shuffle}
            data-active={snapshot.shuffle || undefined}
            onClick={() => void player.setShuffle(!snapshot.shuffle)}
          >
            <Shuffle aria-hidden="true" size={17} />
          </button>
          <button type="button" aria-label="Previous track" onClick={() => void player.previous()}>
            <SkipBack aria-hidden="true" size={18} />
          </button>
          <button
            className="primary-transport"
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            disabled={loading}
            onClick={() => void (playing ? player.pause() : player.resume())}
          >
            {playing ? (
              <Pause aria-hidden="true" size={19} />
            ) : (
              <Play aria-hidden="true" size={19} />
            )}
          </button>
          <button type="button" aria-label="Next track" onClick={() => void player.next()}>
            <SkipForward aria-hidden="true" size={18} />
          </button>
          <button
            type="button"
            aria-label={`Repeat: ${snapshot.repeat}`}
            data-active={snapshot.repeat !== "off" || undefined}
            onClick={() => void player.setRepeat(nextRepeat(snapshot.repeat))}
          >
            {snapshot.repeat === "track" ? (
              <Repeat1 aria-hidden="true" size={17} />
            ) : (
              <Repeat aria-hidden="true" size={17} />
            )}
          </button>
        </div>
        <div className="player-timeline">
          <span>{formatDuration(position)}</span>
          <input
            aria-label="Playback position"
            type="range"
            min="0"
            max={Math.max(duration, 1)}
            step="250"
            value={position}
            disabled={duration <= 0}
            onChange={(event) => setScrubbing(Number(event.target.value))}
            onPointerUp={commitSeek}
            onKeyUp={commitSeek}
          />
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="player-secondary-controls">
        <label className="volume-control">
          <Volume2 aria-hidden="true" size={18} />
          <span className="sr-only">Volume</span>
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="100"
            value={snapshot.volume}
            onChange={(event) => void player.setVolume(Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          aria-label={player.queueOpen ? "Close queue" : "Open queue"}
          aria-expanded={player.queueOpen}
          data-active={player.queueOpen || undefined}
          onClick={() => player.setQueueOpen(!player.queueOpen)}
        >
          <ListMusic aria-hidden="true" size={19} />
        </button>
      </div>
      {(player.error || snapshot.error) && (
        <p className="player-error" role="status">
          {player.error ?? snapshot.error}
        </p>
      )}
    </footer>
  );
}

function nextRepeat(current: "off" | "track" | "queue") {
  if (current === "off") return "queue" as const;
  if (current === "queue") return "track" as const;
  return "off" as const;
}
