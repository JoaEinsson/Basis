export interface AppHealth {
  appName: string;
  version: string;
  status: "ready";
}

export interface LibrarySummary {
  libraryId: string;
  rootInstanceHash: string;
  rootPath: string;
  trackCount: number;
  status: "ready" | "scanning" | "failed";
}

export interface ScanProgress {
  discovered: number;
  indexed: number;
  skippedUnchanged: number;
  failed: number;
  currentPath: string | null;
  currentTitle: string | null;
  complete: boolean;
}

export interface LibraryScanEvent {
  summary: LibrarySummary;
  progress: ScanProgress;
  error: string | null;
}
