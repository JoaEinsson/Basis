import {
  CheckCircle2,
  CircleDashed,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  chooseLibraryRoot,
  getAppHealth,
  getLibraryStatus,
  onLibraryScanProgress,
} from "../lib/tauri";
import type { AppHealth, LibraryScanEvent, LibrarySummary } from "../lib/types";

type BridgeStatus =
  | { kind: "loading" }
  | { kind: "ready"; health: AppHealth }
  | { kind: "unavailable"; message: string };

type LibrarySetup =
  | { kind: "idle"; library: LibrarySummary | null }
  | { kind: "choosing"; library: LibrarySummary | null }
  | { kind: "scanning"; update: LibraryScanEvent }
  | { kind: "ready"; library: LibrarySummary }
  | { kind: "failed"; message: string; library: LibrarySummary | null };

export function Onboarding() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({
    kind: "loading",
  });
  const [librarySetup, setLibrarySetup] = useState<LibrarySetup>({
    kind: "idle",
    library: null,
  });

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    void getAppHealth()
      .then((health) => {
        if (active) {
          setBridgeStatus({ kind: "ready", health });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setBridgeStatus({
            kind: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Desktop bridge unavailable",
          });
        }
      });

    void getLibraryStatus()
      .then((library) => {
        if (!active || library === null) {
          return;
        }
        setLibrarySetup(
          library.status === "failed"
            ? {
                kind: "failed",
                message: "The last library scan did not complete.",
                library,
              }
            : library.status === "scanning"
              ? { kind: "idle", library }
              : { kind: "ready", library },
        );
      })
      .catch(() => {
        // The browser preview intentionally has no native library state.
      });

    void onLibraryScanProgress((update) => {
      if (!active) {
        return;
      }
      if (update.error) {
        setLibrarySetup({
          kind: "failed",
          message: update.error,
          library: update.summary,
        });
        return;
      }
      setLibrarySetup(
        update.progress.complete
          ? { kind: "ready", library: update.summary }
          : { kind: "scanning", update },
      );
    }).then((stopListening) => {
      if (active) {
        unlisten = stopListening;
      } else {
        stopListening();
      }
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  async function handleChooseFolder() {
    setLibrarySetup((current) => ({
      kind: "choosing",
      library: libraryFromSetup(current),
    }));
    try {
      const library = await chooseLibraryRoot();
      if (library === null) {
        setLibrarySetup((current) => ({
          kind: "idle",
          library: libraryFromSetup(current),
        }));
        return;
      }
      setLibrarySetup({
        kind: "scanning",
        update: {
          summary: library,
          progress: emptyScanProgress(),
          error: null,
        },
      });
    } catch (error) {
      setLibrarySetup((current) => ({
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Basis could not open the selected music folder.",
        library: libraryFromSetup(current),
      }));
    }
  }

  return (
    <section className="onboarding" aria-labelledby="onboarding-title">
      <div className="hero-copy">
        <p className="eyebrow">A local-first music library</p>
        <h1 id="onboarding-title">Your music folder stays yours.</h1>
        <p className="hero-description">
          Basis will index the metadata already in your files, keep your
          portable library data beside them, and rebuild its local index
          whenever needed.
        </p>
      </div>

      <div className="onboarding-grid">
        <article className="onboarding-card onboarding-card-primary">
          <div className="card-icon">
            <FolderOpen aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Library setup</p>
            <h2>Choose your music folder</h2>
            <p>
              Basis will create portable library data inside{" "}
              <code>.musiclib</code>
              and never reorganize your audio files.
            </p>
            <button
              className="primary-action"
              type="button"
              onClick={handleChooseFolder}
              disabled={librarySetup.kind === "choosing"}
            >
              <FolderOpen aria-hidden="true" size={17} />
              {librarySetup.kind === "choosing"
                ? "Opening folder picker…"
                : "Choose music folder"}
            </button>
          </div>
        </article>

        <article className="onboarding-card">
          <div className="card-icon">
            <ShieldCheck aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Portable by design</p>
            <h2>Data that travels with your music</h2>
            <p>
              Views, playlists, themes, and history will live in human-readable
              files under <code>.musiclib</code>.
            </p>
          </div>
        </article>
      </div>

      <LibraryScanStatus setup={librarySetup} />

      <section className="bridge-status" aria-live="polite">
        {bridgeStatus.kind === "loading" && (
          <>
            <CircleDashed
              className="status-spinner"
              aria-hidden="true"
              size={18}
            />
            <div>
              <strong>Connecting to the Basis desktop engine</strong>
              <p>Checking the typed Rust command boundary.</p>
            </div>
          </>
        )}

        {bridgeStatus.kind === "ready" && (
          <>
            <CheckCircle2 aria-hidden="true" size={18} />
            <div>
              <strong>Basis desktop bridge ready</strong>
              <p>
                {bridgeStatus.health.appName} {bridgeStatus.health.version} ·{" "}
                {bridgeStatus.health.status}
              </p>
            </div>
          </>
        )}

        {bridgeStatus.kind === "unavailable" && (
          <>
            <CircleDashed aria-hidden="true" size={18} />
            <div>
              <strong>Running in web preview</strong>
              <p>{bridgeStatus.message}</p>
            </div>
          </>
        )}
      </section>
    </section>
  );
}

function LibraryScanStatus({ setup }: { setup: LibrarySetup }) {
  if (setup.kind === "idle" && setup.library === null) {
    return null;
  }

  if (setup.kind === "scanning") {
    const { progress, summary } = setup.update;
    return (
      <section className="scan-status" aria-live="polite">
        <CircleDashed className="status-spinner" aria-hidden="true" size={18} />
        <div>
          <strong>Scanning {summary.rootPath}</strong>
          <p>
            {progress.discovered} audio files found · {progress.indexed} indexed
            {progress.failed > 0
              ? ` · ${progress.failed} skipped after errors`
              : ""}
          </p>
          {progress.currentPath && <code>{progress.currentPath}</code>}
          {progress.currentTitle && <p>Metadata: {progress.currentTitle}</p>}
        </div>
      </section>
    );
  }

  if (setup.kind === "failed") {
    return (
      <section className="scan-status scan-status-error" role="alert">
        <div>
          <strong>Basis could not finish the library scan</strong>
          <p>{setup.message}</p>
        </div>
      </section>
    );
  }

  const library = setup.kind === "ready" ? setup.library : setup.library;
  return (
    <section className="scan-status" aria-live="polite">
      <CheckCircle2 aria-hidden="true" size={18} />
      <div>
        <strong>{library.trackCount} indexed tracks</strong>
        <p>{library.rootPath}</p>
      </div>
    </section>
  );
}

function libraryFromSetup(setup: LibrarySetup): LibrarySummary | null {
  switch (setup.kind) {
    case "idle":
    case "choosing":
    case "failed":
      return setup.library;
    case "ready":
      return setup.library;
    case "scanning":
      return setup.update.summary;
  }
}

function emptyScanProgress(): LibraryScanEvent["progress"] {
  return {
    discovered: 0,
    indexed: 0,
    skippedUnchanged: 0,
    failed: 0,
    currentPath: null,
    currentTitle: null,
    complete: false,
  };
}
