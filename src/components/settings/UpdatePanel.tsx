import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { getAppHealth } from "../../lib/tauri";
import { useUpdater } from "./UpdateProvider";
import { Button, Dialog, DialogActions, Progress, Toggle } from "../ui";

export function UpdatePanel() {
  const updater = useUpdater();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let active = true;
    void getAppHealth()
      .then((health) => {
        if (active) setCurrentVersion(health.version);
      })
      .catch(() => {
        if (active) setCurrentVersion(null);
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
    <section
      className="settings-section"
      id="settings-updates"
      aria-labelledby="update-settings"
    >
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

      <Toggle
        className="system-theme-toggle"
        checked={updater.policy?.automaticChecksEnabled ?? true}
        disabled={!updater.policy || busy}
        onChange={(event) =>
          void updater.setAutomaticChecks(event.target.checked)
        }
      >
        <span>
          <span>Check automatically</span>
          <small>At startup, at most once every 24 hours.</small>
        </span>
      </Toggle>

      {updater.policy?.lastCheckAt && (
        <p className="update-secondary">
          Last attempt: {formatDate(updater.policy.lastCheckAt)}
        </p>
      )}
      {updater.status === "checking" && (
        <p role="status">Checking for updates…</p>
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
              <Progress
                label="Downloading update"
                value={progress ?? undefined}
                max={1}
              />
              <span>
                {progress === null
                  ? "Downloading update…"
                  : `Downloading ${Math.round(progress * 100)}%`}
              </span>
            </div>
          )}
          {updater.status === "installing" && (
            <p role="status">Installing update…</p>
          )}
          {updater.status === "available" && (
            <button type="button" onClick={() => setConfirming(true)}>
              <Download aria-hidden="true" size={16} /> Download and install
            </button>
          )}
        </div>
      )}
      {updater.status === "installed" && (
        <p role="status">Update installed. Restarting Basis…</p>
      )}

      {confirming && updater.available && (
        <Dialog
          className="small-dialog"
          ariaLabelledBy="install-update-title"
          onClose={() => setConfirming(false)}
        >
          <h2 id="install-update-title">
            Install Basis {updater.available.version}?
          </h2>
          <p>
            Basis will close, install the update, and reopen. Playback will
            stop.
          </p>
          <DialogActions>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirming(false);
                void updater.installAvailable();
              }}
            >
              Install and relaunch
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
