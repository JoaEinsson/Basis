import { MonitorDown, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getLinuxDesktopIntegration,
  installLinuxDesktopIntegration,
  removeLinuxDesktopIntegration,
} from "../../lib/tauri";
import type { LinuxDesktopIntegration as IntegrationState } from "../../lib/types";
import { Button, Dialog, DialogActions, InlineStatus } from "../ui";

export function LinuxDesktopIntegration() {
  const [state, setState] = useState<IntegrationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);

  useEffect(() => {
    let active = true;
    void getLinuxDesktopIntegration()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        if (active) setState(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function change(
    action: () => Promise<IntegrationState>,
    fallback: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  if (!state?.supported) return null;

  return (
    <section
      className="settings-section"
      id="linux-integration"
      aria-labelledby="linux-integration-title"
    >
      <div className="settings-section-heading">
        <div>
          <h2 id="linux-integration-title">Linux desktop integration</h2>
          <p>
            Launch Basis from your application menu with a stable AppImage path.
          </p>
        </div>
        {state.installed ? (
          <Button
            disabled={busy}
            onClick={() =>
              void change(
                installLinuxDesktopIntegration,
                "Could not refresh desktop integration.",
              )
            }
          >
            <RefreshCw aria-hidden="true" size={16} /> Refresh
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={busy || !state.canInstall}
            onClick={() =>
              void change(
                installLinuxDesktopIntegration,
                "Could not install desktop integration.",
              )
            }
          >
            <MonitorDown aria-hidden="true" size={16} /> Install
          </Button>
        )}
      </div>

      {state.installed ? (
        <InlineStatus tone="success">Installed for this user</InlineStatus>
      ) : !state.canInstall ? (
        <p className="update-secondary">
          {state.pathConflict
            ? "A file already uses the desktop integration path. It was not changed."
            : "Open the AppImage directly to enable installation."}
        </p>
      ) : null}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {state.managedExecutablePath && (
        <dl className="integration-paths">
          <div>
            <dt>AppImage</dt>
            <dd>{state.managedExecutablePath}</dd>
          </div>
          {state.desktopEntryPath && (
            <div>
              <dt>Launcher</dt>
              <dd>{state.desktopEntryPath}</dd>
            </div>
          )}
        </dl>
      )}
      {state.installed && (
        <Button
          variant="text"
          disabled={busy}
          onClick={() => setConfirmingRemoval(true)}
        >
          <Trash2 aria-hidden="true" size={16} /> Remove desktop integration
        </Button>
      )}

      {confirmingRemoval && (
        <Dialog
          className="small-dialog"
          ariaLabelledBy="remove-integration-title"
          dismissible={!busy}
          onClose={() => setConfirmingRemoval(false)}
        >
          <h2 id="remove-integration-title">Remove desktop integration?</h2>
          <p>
            This removes the managed AppImage, launcher, and icon. Your library
            and settings are not changed.
          </p>
          <DialogActions>
            <Button onClick={() => setConfirmingRemoval(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmingRemoval(false);
                void change(
                  removeLinuxDesktopIntegration,
                  "Could not remove desktop integration.",
                );
              }}
            >
              Remove
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </section>
  );
}
