import { FolderOpen } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useLibraryContext } from "../components/shell/LibraryContext";

export function Onboarding() {
  const { library, chooseLibrary, choosingLibrary, libraryError } =
    useLibraryContext();

  if (library !== null) {
    return <Navigate to="/views/builtin%3Aalbums" replace />;
  }

  return (
    <section className="page library-empty" aria-labelledby="library-title">
      <p className="page-kicker">Basis</p>
      <h1 id="library-title">Library</h1>
      <div className="quiet-state">
        <h2>No music folder added.</h2>
        <button
          className="primary-action"
          type="button"
          onClick={() => void chooseLibrary()}
          disabled={choosingLibrary}
        >
          <FolderOpen aria-hidden="true" size={17} />
          {choosingLibrary ? "Opening…" : "Add folder"}
        </button>
        <p>
          Add a folder to index your music library.
          <br />
          Basis does not move or reorganize audio files.
        </p>
        {libraryError && (
          <p className="inline-error" role="alert">
            {libraryError}
          </p>
        )}
      </div>
    </section>
  );
}
