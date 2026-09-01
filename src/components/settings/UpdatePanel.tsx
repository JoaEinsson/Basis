import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getAppHealth } from "../../lib/tauri";
import { useUpdater } from "./UpdateProvider";

export function UpdatePanel() {
  const updater = useUpdater();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    void getAppHealth().then((health) => {
      if (active) setCurrentVersion(health.version);
    });
    return () => {
      active = false;
    };
  }, []);

  const busy = ["checking", "downloading", "installing"].includes(
    updater.status,
  );
  const progress = updater.contentLength
    ? Math.min(updater.downloadedBytes / updater.contentLength, 1)
    : null;

  return (
    <section className="settings-section" aria-labelledby="update-settings">
      <div className="settings-section-heading">
        <div>
          <h2 id="update-settings">About and updates</h2>
          <p>Version {currentVersion ?? "…"}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void updater.checkNow()}
        >
          <RefreshCw aria-hidden="true" size={16} /> Check for updates
        </button>
      </div>

      <label className="system-theme-toggle">
        <input
          type="checkbox"
          checked={updater.policy?.automaticChecksEnabled ?? true}
          disabled={!updater.policy || busy}
          onChange={(event) =>
            void updater.setAutomaticChecks(event.target.checked)
          }
        />
        <span>
          <span>Check automatically</span>
          <small>At startup, at most once every 24 hours.</small>
        </span>
      </label>

      {updater.policy?.lastCheckAt && (
        <p className="update-secondary">
          Last attempt: {formatDate(updater.policy.lastCheckAt)}
        </p>
      )}
      {updater.status === "checking" && (
        <p role="status">Checking the signed release channel…</p>
      )}
      {updater.status === "upToDate" && (
        <p role="status">Basis is up to date.</p>
      )}
      {updater.error && (
        <p className="inline-error" role="alert">
          {updater.error}
        </p>
      )}

      {updater.available && (
        <div className="update-available">
          <div>
            <strong>Basis {updater.available.version} is available</strong>
            <span>
              Installed: {updater.available.currentVersion}
              {updater.available.date
                ? ` · Published ${formatDate(updater.available.date)}`
                : ""}
            </span>
          </div>
          {updater.available.notes && (
            <p className="update-notes">{updater.available.notes}</p>
          )}
          {updater.status === "downloading" && (
            <div className="update-progress" role="status">
              <progress value={progress ?? undefined} max={1} />
              <span>
                {progress === null
                  ? "Downloading signed update…"
                  : `Downloading ${Math.round(progress * 100)}%`}
              </span>
            </div>
          )}
          {updater.status === "installing" && (
            <p role="status">Installing the verified update…</p>
          )}
          {updater.status === "available" && (
            <button type="button" onClick={() => setConfirming(true)}>
              <Download aria-hidden="true" size={16} /> Download and install
            </button>
          )}
        </div>
      )}

      {confirming && updater.available && (
        <div className="dialog-backdrop">
          <section
            className="small-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="install-update-title"
          >
            <h2 id="install-update-title">
              Install Basis {updater.available.version}?
            </h2>
            <p>
              Basis will download the signed artifact, verify it, install it,
              and relaunch. Playback will stop when installation begins.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  void updater.installAvailable();
                }}
              >
                Install and relaunch
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
