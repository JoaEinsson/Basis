import { useEffect, useState } from "react";
import {
  getLyricsPrefetchPolicy,
  setLyricsPrefetchEnabled,
} from "../../lib/tauri";
import type { LyricsPrefetchPolicy } from "../../lib/types";
import { Toggle } from "../ui";

export function LyricsSettings() {
  const [policy, setPolicy] = useState<LyricsPrefetchPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getLyricsPrefetchPolicy()
      .then((next) => {
        if (active) setPolicy(next);
      })
      .catch((cause: unknown) => {
        if (active) setError(messageFrom(cause));
      });
    return () => {
      active = false;
    };
  }, []);

  async function changePrefetch(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const next = await setLyricsPrefetchEnabled(enabled);
      setPolicy(next);
      window.dispatchEvent(
        new CustomEvent("basis:lyrics-prefetch-policy-changed", {
          detail: next,
        }),
      );
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="settings-section"
      id="settings-lyrics"
      aria-labelledby="lyrics-settings"
    >
      <div>
        <h2 id="lyrics-settings">Lyrics</h2>
        <p>Control optional network work performed outside the Lyrics view.</p>
      </div>
      <Toggle
        className="system-theme-toggle"
        checked={policy?.enabled ?? false}
        disabled={!policy || busy}
        onChange={(event) => void changePrefetch(event.target.checked)}
      >
        <span>
          <span>Prefetch lyrics for the next track</span>
          <small>
            When enabled, Basis may contact LRCLIB for only the next queued
            track. Results stay in a disposable local cache.
          </small>
        </span>
      </Toggle>
      {policy && (
        <p className="update-secondary">
          Cache limit: {policy.cacheEntryLimit} lookups,{" "}
          {Math.round(policy.cacheBytesLimit / 1024 / 1024)} MiB.
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function messageFrom(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "Lyrics settings are unavailable.";
}
