import { describe, expect, it } from "vitest";
import type { PlayerSnapshot } from "../../lib/types";
import { nextLyricsPrefetchTrackId } from "./PlayerContext";

describe("next lyric prefetch target", () => {
  it("selects exactly one next play-order item and follows queue repeat", () => {
    const source = snapshot();
    expect(nextLyricsPrefetchTrackId(source)).toBe("track-2");

    source.currentTrack = source.queue[2];
    source.currentIndex = 2;
    expect(nextLyricsPrefetchTrackId(source)).toBeNull();
    source.repeat = "queue";
    expect(nextLyricsPrefetchTrackId(source)).toBe("track-1");
  });

  it("does not prefetch the current item or an inconsistent queue target", () => {
    const source = snapshot();
    source.playOrder = ["queue-1"];
    source.queue = [source.queue[0]];
    source.repeat = "queue";
    expect(nextLyricsPrefetchTrackId(source)).toBeNull();

    source.playOrder = ["queue-1", "missing"];
    expect(nextLyricsPrefetchTrackId(source)).toBeNull();

    source.playOrder = ["queue-1", "queue-2"];
    source.queue = snapshot().queue.slice(0, 2);
    source.status = "paused";
    expect(nextLyricsPrefetchTrackId(source)).toBeNull();
  });
});

function snapshot(): PlayerSnapshot {
  const queue = [1, 2, 3].map((index) => ({
    queueId: `queue-${index}`,
    track: {
      id: `track-${index}`,
      relPath: `Album/${index}.flac`,
      title: `Track ${index}`,
      artist: "Artist",
      artists: ["Artist"],
      albumArtist: "Artist",
      album: "Album",
      year: 2026,
      trackNo: index,
      discNo: 1,
      genres: [],
      composer: null,
      durationMs: 120_000,
      codec: "FLAC",
      container: "FLAC",
      sampleRate: 44_100,
      bitDepth: 16,
      channels: 2,
      bitrate: 800_000,
      artworkKey: null,
      addedAt: 0,
      lastPlayed: null,
      playCount: 0,
      favorite: false,
    },
  }));
  return {
    status: "playing",
    queue,
    playOrder: queue.map((item) => item.queueId),
    currentIndex: 0,
    currentTrack: queue[0],
    positionMs: 0,
    durationMs: 120_000,
    volume: 80,
    muted: false,
    shuffle: false,
    repeat: "off",
    error: null,
    outputDevice: null,
  };
}
