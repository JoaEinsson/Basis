import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation((command: string) => {
    if (command === "app_health") {
      return Promise.resolve({
        appName: "Basis",
        version: "0.1.0",
        status: "ready",
      });
    }
    return Promise.resolve(null);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

import { Onboarding } from "../pages/Onboarding";

describe("Basis onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the onboarding content and typed desktop health state", async () => {
    render(<Onboarding />);

    expect(
      screen.getByRole("heading", { name: "Your music folder stays yours." }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Basis desktop bridge ready"),
    ).toBeInTheDocument();
  });
});
