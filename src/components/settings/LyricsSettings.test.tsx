import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLyricsPrefetchPolicy: vi.fn(),
  setLyricsPrefetchEnabled: vi.fn(),
}));

vi.mock("../../lib/tauri", () => mocks);

import { LyricsSettings } from "./LyricsSettings";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLyricsPrefetchPolicy.mockResolvedValue({
    enabled: false,
    cacheEntryLimit: 64,
    cacheBytesLimit: 8 * 1024 * 1024,
  });
  mocks.setLyricsPrefetchEnabled.mockResolvedValue({
    enabled: true,
    cacheEntryLimit: 64,
    cacheBytesLimit: 8 * 1024 * 1024,
  });
});

it("keeps next-track network prefetch explicit and reports its bounds", async () => {
  const changed = vi.fn();
  window.addEventListener("basis:lyrics-prefetch-policy-changed", changed);
  render(<LyricsSettings />);

  const toggle = await screen.findByRole("switch", {
    name: /prefetch lyrics for the next track/i,
  });
  expect(toggle).not.toBeChecked();
  expect(screen.getByText(/64 lookups, 8 MiB/i)).toBeInTheDocument();
  fireEvent.click(toggle);

  await waitFor(() =>
    expect(mocks.setLyricsPrefetchEnabled).toHaveBeenCalledWith(true),
  );
  expect(toggle).toBeChecked();
  expect(changed).toHaveBeenCalledOnce();
  window.removeEventListener("basis:lyrics-prefetch-policy-changed", changed);
});
