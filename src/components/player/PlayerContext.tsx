import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  reorderPlaybackQueue,
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
  reorderQueue: (queueId: string, targetIndex: number) => Promise<boolean>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({
  children,
  connect = true,
  initialSnapshot = null,
}: {
  children: React.ReactNode;
  connect?: boolean;
  initialSnapshot?: PlayerSnapshot | null;
}) {
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(
    initialSnapshot,
  );
  const [error, setError] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (!connect) return;
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
        setSnapshot((current) =>
          current
            ? {
                ...current,
                status: event.status,
                positionMs: event.positionMs,
                durationMs: event.durationMs,
                volume: event.volume,
                shuffle: event.shuffle,
                repeat: event.repeat,
                error: event.error,
                outputDevice: event.outputDevice,
              }
            : current,
        );
        setError(event.error);
      }),
      () => active,
      unlisteners,
    );
    subscribe(
      onPlayerTrackChanged((event) => {
        if (!active) return;
        setSnapshot((current) =>
          current ? { ...current, currentTrack: event.currentTrack } : current,
        );
      }),
      () => active,
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
      () => active,
      unlisteners,
    );
    subscribe(
      onPlayerError((event) => {
        if (active) setError(event.message);
      }),
      () => active,
      unlisteners,
    );

    return () => {
      active = false;
      for (const unlisten of unlisteners) unlisten();
    };
  }, [connect]);

  const perform = useCallback(
    async (request: () => Promise<PlayerSnapshot>) => {
      try {
        const next = await request();
        setSnapshot(next);
        setError(next.error);
        return true;
      } catch (cause) {
        setError(messageFrom(cause));
        return false;
      }
    },
    [],
  );

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
      reorderQueue: (queueId, targetIndex) =>
        perform(() => reorderPlaybackQueue(queueId, targetIndex)),
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

export function PlayerKeyboardShortcuts() {
  const player = usePlayer();
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const current = playerRef.current;
      if (
        !current.snapshot?.currentTrack ||
        preservesPlaybackKey(event.target)
      ) {
        return;
      }
      if (event.code === "Space" || event.key === "MediaPlayPause") {
        event.preventDefault();
        void (current.snapshot.status === "playing"
          ? current.pause()
          : current.resume());
      } else if (event.key === "MediaTrackNext") {
        event.preventDefault();
        void current.next();
      } else if (event.key === "MediaTrackPrevious") {
        event.preventDefault();
        void current.previous();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return null;
}

function subscribe(
  pending: Promise<() => void>,
  isActive: () => boolean,
  unlisteners: Array<() => void>,
) {
  void pending
    .then((unlisten) => {
      if (isActive()) unlisteners.push(unlisten);
      else unlisten();
    })
    .catch(() => undefined);
}

function messageFrom(cause: unknown) {
  return cause instanceof Error ? cause.message : "Playback is unavailable.";
}

function preservesPlaybackKey(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        Boolean(target.closest("button, a, summary, [role='menuitem']"))))
  );
}
