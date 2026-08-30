import { createContext, useContext } from "react";
import type {
  LibraryScanEvent,
  LibrarySummary,
  ViewDefinition,
} from "../../lib/types";

export type LibraryContextValue = {
  library: LibrarySummary | null;
  scan: LibraryScanEvent | null;
  libraryError: string | null;
  views: ViewDefinition[];
  choosingLibrary: boolean;
  chooseLibrary: () => Promise<void>;
  refreshViews: () => Promise<void>;
  replaceViews: (views: ViewDefinition[]) => void;
};

export const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibraryContext(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (context === null) {
    throw new Error("Library context is only available inside the Basis shell");
  }
  return context;
}
