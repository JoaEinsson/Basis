import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { beginUpdateCheck, setAutomaticUpdateChecks } from "../../lib/tauri";
import type { UpdatePolicy } from "../../lib/types";

type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "installed"
  | "error";

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string | null;
}

interface UpdateContextValue {
  policy: UpdatePolicy | null;
  status: UpdateStatus;
  available: AvailableUpdate | null;
  error: string | null;
  downloadedBytes: number;
  contentLength: number | null;
  checkNow: () => Promise<void>;
  setAutomaticChecks: (enabled: boolean) => Promise<void>;
  installAvailable: () => Promise<void>;
}

export const UpdateContext = createContext<UpdateContextValue | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<UpdatePolicy | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [available, setAvailable] = useState<AvailableUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);
  const pendingUpdate = useRef<Update | null>(null);
  const checkInFlight = useRef(false);

  const performCheck = useCallback(async (manual: boolean) => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;
    try {
      const permit = await beginUpdateCheck(manual);
      setPolicy(permit.policy);
      if (!permit.allowed) return;
      setStatus("checking");
      setError(null);
      const next = await check({ timeout: 15_000, allowDowngrades: false });
      if (pendingUpdate.current && pendingUpdate.current !== next) {
        await pendingUpdate.current.close();
      }
      pendingUpdate.current = next;
      if (!next) {
        setAvailable(null);
        setStatus("upToDate");
        return;
      }
      setAvailable({
        version: next.version,
        currentVersion: next.currentVersion,
        date: next.date ?? null,
        notes: next.body ?? null,
      });
      setStatus("available");
    } catch {
      setStatus("error");
      setError(messageFrom());
    } finally {
      checkInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void performCheck(false);
    return () => {
      if (pendingUpdate.current) void pendingUpdate.current.close();
    };
  }, [performCheck]);

  const setAutomaticChecks = useCallback(async (enabled: boolean) => {
    setError(null);
    try {
      setPolicy(await setAutomaticUpdateChecks(enabled));
    } catch {
      setStatus("error");
      setError(messageFrom());
    }
  }, []);

  const installAvailable = useCallback(async () => {
    const update = pendingUpdate.current;
    if (!update) return;
    setStatus("downloading");
    setError(null);
    setDownloadedBytes(0);
    setContentLength(null);
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          setContentLength(event.data.contentLength ?? null);
          return;
        }
        if (event.event === "Progress") {
          setDownloadedBytes((value) => value + event.data.chunkLength);
          return;
        }
        setStatus("installing");
      });
      setStatus("installed");
      await relaunch();
    } catch {
      setStatus("error");
      setError(messageFrom());
    }
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        policy,
        status,
        available,
        error,
        downloadedBytes,
        contentLength,
        checkNow: () => performCheck(true),
        setAutomaticChecks,
        installAvailable,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdater() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error("useUpdater must be used inside UpdateProvider");
  return value;
}

function messageFrom() {
  return "Could not complete the update operation.";
}
