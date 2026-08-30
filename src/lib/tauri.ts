import type { UnlistenFn } from "@tauri-apps/api/event";
import { commands, events } from "./bindings";
import type { AppHealth, LibraryScanEvent, LibrarySummary } from "./types";

export function getAppHealth(): Promise<AppHealth> {
  return commands.appHealth();
}

export async function chooseLibraryRoot(): Promise<LibrarySummary | null> {
  return unwrapResult(await commands.libraryChooseRoot());
}

export async function getLibraryStatus(): Promise<LibrarySummary | null> {
  return unwrapResult(await commands.libraryStatus());
}

export function onLibraryScanProgress(
  handler: (event: LibraryScanEvent) => void,
): Promise<UnlistenFn> {
  return events.libraryScanProgress.listen((event) => {
    handler(event.payload);
  });
}

function unwrapResult<T>(
  result:
    | {
        status: "ok";
        data: T;
      }
    | {
        status: "error";
        error: string;
      },
): T {
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}
