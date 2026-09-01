import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  beginUpdateCheck: vi.fn(),
  setAutomaticUpdateChecks: vi.fn(),
  check: vi.fn(),
  relaunch: vi.fn(),
  close: vi.fn(),
  downloadAndInstall: vi.fn(),
}));

vi.mock("../../lib/tauri", () => ({
  beginUpdateCheck: mocks.beginUpdateCheck,
  setAutomaticUpdateChecks: mocks.setAutomaticUpdateChecks,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: mocks.check,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: mocks.relaunch,
}));

import { UpdateProvider, useUpdater } from "./UpdateProvider";

describe("signed updater policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.beginUpdateCheck.mockResolvedValue({
      allowed: true,
      policy: {
        automaticChecksEnabled: true,
        lastCheckAt: "2026-08-31T22:00:00Z",
        automaticCheckDue: false,
      },
    });
    mocks.check.mockResolvedValue({
      version: "0.2.0",
      currentVersion: "0.1.0",
      date: "2026-09-01T00:00:00Z",
      body: "Signed release",
      close: mocks.close,
      downloadAndInstall: mocks.downloadAndInstall,
    });
    mocks.downloadAndInstall.mockImplementation(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 40 } });
      onEvent({ event: "Progress", data: { chunkLength: 60 } });
      onEvent({ event: "Finished" });
    });
    mocks.relaunch.mockResolvedValue(undefined);
  });

  it("checks asynchronously and installs only after an explicit action", async () => {
    render(
      <UpdateProvider>
        <Probe />
      </UpdateProvider>,
    );

    expect(await screen.findByText("available:0.2.0")).toBeInTheDocument();
    expect(mocks.beginUpdateCheck).toHaveBeenCalledWith(false);
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(mocks.downloadAndInstall).toHaveBeenCalled());
    expect(mocks.relaunch).toHaveBeenCalled();
  });

  it("does not contact the endpoint when the 24-hour permit is denied", async () => {
    mocks.beginUpdateCheck.mockResolvedValueOnce({
      allowed: false,
      policy: {
        automaticChecksEnabled: true,
        lastCheckAt: "2026-08-31T22:00:00Z",
        automaticCheckDue: false,
      },
    });
    render(
      <UpdateProvider>
        <Probe />
      </UpdateProvider>,
    );

    expect(await screen.findByText("idle:none")).toBeInTheDocument();
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("keeps the local app mounted when the update endpoint fails", async () => {
    mocks.check.mockRejectedValueOnce(
      new Error("release endpoint unavailable"),
    );
    render(
      <UpdateProvider>
        <span>Local player remains available</span>
        <Probe />
      </UpdateProvider>,
    );

    expect(
      screen.getByText("Local player remains available"),
    ).toBeInTheDocument();
    expect(await screen.findByText("error:none")).toBeInTheDocument();
    expect(
      screen.getByText("Local player remains available"),
    ).toBeInTheDocument();
    expect(mocks.downloadAndInstall).not.toHaveBeenCalled();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});

function Probe() {
  const updater = useUpdater();
  return (
    <div>
      <span>
        {updater.status}:{updater.available?.version ?? "none"}
      </span>
      <button type="button" onClick={() => void updater.installAvailable()}>
        Install
      </button>
    </div>
  );
}
