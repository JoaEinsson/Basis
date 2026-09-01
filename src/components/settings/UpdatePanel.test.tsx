import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { UpdateContext } from "./UpdateProvider";

vi.mock("../../lib/tauri", () => ({
  getAppHealth: vi.fn().mockResolvedValue({
    appName: "Basis",
    version: "0.1.0",
    status: "ready",
  }),
}));

import { UpdatePanel } from "./UpdatePanel";

it("requires explicit confirmation before installing an available update", async () => {
  const installAvailable = vi.fn();
  render(
    <UpdateContext.Provider
      value={{
        policy: {
          automaticChecksEnabled: true,
          lastCheckAt: null,
          automaticCheckDue: false,
        },
        status: "available",
        available: {
          version: "0.2.0",
          currentVersion: "0.1.0",
          date: null,
          notes: "Signed release notes",
        },
        error: null,
        downloadedBytes: 0,
        contentLength: null,
        checkNow: vi.fn(),
        setAutomaticChecks: vi.fn(),
        installAvailable,
      }}
    >
      <UpdatePanel />
    </UpdateContext.Provider>,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "Download and install" }),
  );
  expect(installAvailable).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: "Install Basis 0.2.0?" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Install and relaunch" }));
  expect(installAvailable).toHaveBeenCalledTimes(1);
});
