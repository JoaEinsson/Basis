import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { LinuxDesktopIntegration as IntegrationState } from "../../lib/types";

const getLinuxDesktopIntegration = vi.fn();
const installLinuxDesktopIntegration = vi.fn();
const removeLinuxDesktopIntegration = vi.fn();

vi.mock("../../lib/tauri", () => ({
  getLinuxDesktopIntegration: () => getLinuxDesktopIntegration(),
  installLinuxDesktopIntegration: () => installLinuxDesktopIntegration(),
  removeLinuxDesktopIntegration: () => removeLinuxDesktopIntegration(),
}));

import { LinuxDesktopIntegration } from "./LinuxDesktopIntegration";

const available: IntegrationState = {
  supported: true,
  installed: false,
  canInstall: true,
  pathConflict: false,
  managedExecutablePath: "/home/user/.local/bin/Basis.AppImage",
  desktopEntryPath: "/home/user/.local/share/applications/basis.desktop",
  iconPath: "/home/user/.local/share/icons/hicolor/256x256/apps/basis.png",
};

beforeEach(() => {
  getLinuxDesktopIntegration.mockReset();
  installLinuxDesktopIntegration.mockReset();
  removeLinuxDesktopIntegration.mockReset();
});

it("installs Linux desktop integration only after an explicit action", async () => {
  getLinuxDesktopIntegration.mockResolvedValue(available);
  installLinuxDesktopIntegration.mockResolvedValue({
    ...available,
    installed: true,
  });

  render(<LinuxDesktopIntegration />);

  expect(installLinuxDesktopIntegration).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Install" }));

  await waitFor(() =>
    expect(installLinuxDesktopIntegration).toHaveBeenCalled(),
  );
  expect(screen.getByText("Installed for this user")).toBeInTheDocument();
});

it("requires confirmation before removing managed files", async () => {
  const installed = { ...available, installed: true };
  getLinuxDesktopIntegration.mockResolvedValue(installed);
  removeLinuxDesktopIntegration.mockResolvedValue(available);

  render(<LinuxDesktopIntegration />);

  fireEvent.click(
    await screen.findByRole("button", { name: "Remove desktop integration" }),
  );
  expect(removeLinuxDesktopIntegration).not.toHaveBeenCalled();
  expect(
    screen.getByRole("heading", { name: "Remove desktop integration?" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() => expect(removeLinuxDesktopIntegration).toHaveBeenCalled());
});

it("does not render Linux controls on other platforms", async () => {
  getLinuxDesktopIntegration.mockResolvedValue({
    ...available,
    supported: false,
    canInstall: false,
  });

  const { container } = render(<LinuxDesktopIntegration />);

  await waitFor(() => expect(getLinuxDesktopIntegration).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
