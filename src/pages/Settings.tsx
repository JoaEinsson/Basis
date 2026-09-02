import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { AppearanceEditor } from "../components/settings/AppearanceEditor";
import { UpdatePanel } from "../components/settings/UpdatePanel";
import { useLibraryContext } from "../components/shell/LibraryContext";
import { Button, Dialog, DialogActions } from "../components/ui";
import { deleteView, saveView, setPinnedViews } from "../lib/tauri";
import type { ViewDefinition } from "../lib/types";

export function Settings() {
  const { library, views, refreshViews, chooseLibrary, choosingLibrary } =
    useLibraryContext();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<ViewDefinition | null>(null);
  const [deleting, setDeleting] = useState<ViewDefinition | null>(null);
  const pinned = views.filter((view) => view.pin_to_sidebar);

  async function persistOrder(ids: string[]) {
    setBusy(true);
    setError(null);
    try {
      await setPinnedViews(ids);
      await refreshViews();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Primary navigation could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }

  function togglePinned(view: ViewDefinition) {
    const ids = pinned.map((candidate) => candidate.id);
    void persistOrder(
      view.pin_to_sidebar
        ? ids.filter((id) => id !== view.id)
        : [...ids, view.id],
    );
  }

  function movePinned(view: ViewDefinition, direction: -1 | 1) {
    const ids = pinned.map((candidate) => candidate.id);
    const index = ids.indexOf(view.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
    void persistOrder(ids);
  }

  async function renameView(name: string) {
    if (!renaming) return;
    setBusy(true);
    setError(null);
    try {
      await saveView({ ...renaming, name: name.trim() });
      await refreshViews();
      setRenaming(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The View could not be renamed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    try {
      await deleteView(deleting.id);
      await refreshViews();
      setDeleting(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The View could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <div className="page-heading">
        <div>
          <p className="page-kicker">Basis</p>
          <h1 id="settings-title">Settings</h1>
        </div>
      </div>
      <section
        className="settings-section"
        aria-labelledby="music-folder-settings"
      >
        <div className="settings-section-heading">
          <div>
            <h2 id="music-folder-settings">Music folder</h2>
            <p>
              {library
                ? `Current folder: ${library.rootPath}`
                : "Choose the folder that contains your music."}
            </p>
          </div>
          <button
            type="button"
            disabled={choosingLibrary}
            onClick={() => void chooseLibrary()}
          >
            <FolderOpen aria-hidden="true" size={16} />
            {choosingLibrary
              ? "Opening…"
              : library
                ? "Change folder…"
                : "Add folder…"}
          </button>
        </div>
      </section>
      <AppearanceEditor libraryReady={library !== null} />
      <UpdatePanel />
      <section
        className="settings-section"
        aria-labelledby="navigation-settings"
      >
        <div>
          <h2 id="navigation-settings">Primary navigation</h2>
          <p>
            Choose and order the Views shown in the top toolbar. Hidden Views
            remain available here.
          </p>
        </div>
        {library === null && (
          <p className="inline-error">
            Add a music folder before changing portable navigation settings.
          </p>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="view-settings-list">
          {views.map((view) => {
            const pinnedIndex = pinned.findIndex(
              (candidate) => candidate.id === view.id,
            );
            const custom = !view.id.startsWith("builtin:");
            return (
              <div className="view-setting-row" key={view.id}>
                <span>
                  <span className="entity-title">{view.name}</span>
                  <span className="entity-subtitle">
                    {custom ? "Custom View" : "Built-in View"} · {view.entity}
                  </span>
                </span>
                <span className="row-actions">
                  {view.pin_to_sidebar && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${view.name} earlier`}
                        disabled={busy || pinnedIndex === 0}
                        onClick={() => movePinned(view, -1)}
                      >
                        <ArrowUp aria-hidden="true" size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${view.name} later`}
                        disabled={busy || pinnedIndex === pinned.length - 1}
                        onClick={() => movePinned(view, 1)}
                      >
                        <ArrowDown aria-hidden="true" size={16} />
                      </button>
                    </>
                  )}
                  {custom && (
                    <button
                      type="button"
                      aria-label={`Rename ${view.name}`}
                      disabled={busy}
                      onClick={() => setRenaming(view)}
                    >
                      <Pencil aria-hidden="true" size={16} />
                    </button>
                  )}
                  {custom && (
                    <button
                      type="button"
                      aria-label={`Delete ${view.name}`}
                      disabled={busy}
                      onClick={() => setDeleting(view)}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || library === null}
                    onClick={() => togglePinned(view)}
                  >
                    {view.pin_to_sidebar ? (
                      <EyeOff aria-hidden="true" size={16} />
                    ) : (
                      <Eye aria-hidden="true" size={16} />
                    )}
                    {view.pin_to_sidebar ? "Hide" : "Show"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {renaming && (
        <NameDialog
          title="Rename View"
          initialName={renaming.name}
          busy={busy}
          onCancel={() => setRenaming(null)}
          onSave={(name) => void renameView(name)}
        />
      )}
      {deleting && (
        <Dialog
          className="small-dialog"
          ariaLabelledBy="delete-view-title"
          dismissible={!busy}
          onClose={() => setDeleting(null)}
        >
          <h2 id="delete-view-title">Delete “{deleting.name}”?</h2>
          <p>
            This removes the custom View file. It does not change or delete
            music.
          </p>
          <DialogActions>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Delete View
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </section>
  );
}

function NameDialog({
  title,
  initialName,
  busy,
  onCancel,
  onSave,
}: {
  title: string;
  initialName: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <Dialog
      className="small-dialog"
      ariaLabel={title}
      dismissible={!busy}
      onClose={onCancel}
    >
      <form
        className="ui-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
      >
        <h2>{title}</h2>
        <label>
          Name
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <DialogActions>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim()}>
            Save
          </button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
