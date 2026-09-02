import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type StopWindowListener = () => void;

export interface WindowAdapter {
  readonly available: boolean;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  minimize(): Promise<void>;
  startDragging(): Promise<void>;
  subscribeMaximized(
    listener: (maximized: boolean) => void,
  ): Promise<StopWindowListener>;
  toggleMaximize(): Promise<void>;
}

const browserWindowAdapter: WindowAdapter = {
  available: false,
  close: async () => undefined,
  isMaximized: async () => false,
  minimize: async () => undefined,
  startDragging: async () => undefined,
  subscribeMaximized: async () => () => undefined,
  toggleMaximize: async () => undefined,
};

export function createWindowAdapter(): WindowAdapter {
  if (!isTauri()) return browserWindowAdapter;

  const appWindow = getCurrentWindow();
  return {
    available: true,
    close: () => appWindow.close(),
    isMaximized: () => appWindow.isMaximized(),
    minimize: () => appWindow.minimize(),
    startDragging: () => appWindow.startDragging(),
    subscribeMaximized: (listener) =>
      appWindow.onResized(() => {
        void appWindow.isMaximized().then(listener).catch(reportWindowError);
      }),
    toggleMaximize: () => appWindow.toggleMaximize(),
  };
}

export const currentWindowAdapter = createWindowAdapter();

function reportWindowError(cause: unknown) {
  console.error("Basis could not read the window state.", cause);
}
