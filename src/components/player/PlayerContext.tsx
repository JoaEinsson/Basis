import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getPlayerState,
  nextTrack,
  onPlayerError,
  onPlayerQueueChanged,
  onPlayerState,
  onPlayerTrackChanged,
  pausePlayback,
  playCollection as requestPlayCollection,
  previousTrack,
  resumePlayback,
  seekPlayback,
  setPlaybackRepeat,
  setPlaybackShuffle,
  setPlaybackVolume,
} from "../../lib/tauri";
import type {
  PlayerSnapshot,
  QueueInsertMode,
  RepeatMode,
} from "../../lib/types";

type PlayerContextValue = {
  snapshot: PlayerSnapshot | null;
  error: string | null;
  queueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
  playCollection: (
    trackIds: string[],
    startTrackId: string,
    mode?: QueueInsertMode,
  ) => Promise<boolean>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  setShuffle: (enabled: boolean) => Promise<void>;
  setRepeat: (repeat: RepeatMode) => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];

    void getPlayerState()
      .then((next) => {
        if (active) setSnapshot(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFrom(cause));
      });

    subscribe(
      onPlayerState((event) => {
        if (!active) return;
        setSnapshot(event.snapshot);
        setError(event.snapshot.error);
      }),
      active,
      unlisteners,
    );
    subscribe(
      onPlayerTrackChanged((event) => {
        if (!active) return;
        setSnapshot((current) =>
          current ? { ...current, currentTrack: event.currentTrack } : current,
        );
      }),
      active,
      unlisteners,
    );
    subscribe(
      onPlayerQueueChanged((event) => {
        if (!active) return;
        setSnapshot((current) =>
          current
            ? {
                ...current,
                queue: event.queue,
                playOrder: event.playOrder,
                currentIndex: event.currentIndex,
              }
            : current,
        );
      }),
      active,
      unlisteners,
    );
    subscribe(
      onPlayerError((event) => {
        if (active) setError(event.message);
      }),
      active,
      unlisteners,
    );

    return () => {
      active = false;
      for (const unlisten of unlisteners) unlisten();
    };
  }, []);

  const perform = useCallback(async (request: () => Promise<PlayerSnapshot>) => {
    try {
      const next = await request();
      setSnapshot(next);
      setError(next.error);
      return true;
    } catch (cause) {
      setError(messageFrom(cause));
      return false;
    }
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      snapshot,
      error,
      queueOpen,
      setQueueOpen,
      playCollection: (trackIds, startTrackId, mode = "replace") =>
        perform(() => requestPlayCollection(trackIds, startTrackId, mode)),
      pause: async () => {
        await perform(pausePlayback);
      },
      resume: async () => {
        await perform(resumePlayback);
      },
      seek: async (positionMs) => {
        await perform(() => seekPlayback(positionMs));
      },
      next: async () => {
        await perform(nextTrack);
      },
      previous: async () => {
        await perform(previousTrack);
      },
      setVolume: async (volume) => {
        await perform(() => setPlaybackVolume(volume));
      },
      setShuffle: async (enabled) => {
        await perform(() => setPlaybackShuffle(enabled));
      },
      setRepeat: async (repeat) => {
        await perform(() => setPlaybackRepeat(repeat));
      },
    }),
    [error, perform, queueOpen, snapshot],
  );

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("Player components must be rendered within PlayerProvider");
  }
  return context;
}

function subscribe(
  pending: Promise<() => void>,
  active: boolean,
  unlisteners: Array<() => void>,
) {
  void pending
    .then((unlisten) => {
      if (active) unlisteners.push(unlisten);
      else unlisten();
    })
    .catch(() => undefined);
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : "Playback is unavailable.";
}
