import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AppHealth, LibraryScanEvent, LibrarySummary } from "./types";

export function getAppHealth(): Promise<AppHealth> {
  return invoke<AppHealth>("app_health");
}

export function chooseLibraryRoot(): Promise<LibrarySummary | null> {
  return invoke<LibrarySummary | null>("library_choose_root");
}

export function getLibraryStatus(): Promise<LibrarySummary | null> {
  return invoke<LibrarySummary | null>("library_status");
}

export function onLibraryScanProgress(
  handler: (event: LibraryScanEvent) => void,
): Promise<UnlistenFn> {
  return listen<LibraryScanEvent>("library://scan-progress", (event) => {
    handler(event.payload);
  });
}
