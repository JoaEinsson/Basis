import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tauri", () => ({
  getArtworkThumbnail: vi
    .fn()
    .mockResolvedValue("data:image/webp;base64,fixture"),
}));

import { ArtworkPlaceholder } from "./ArtworkPlaceholder";

describe("ArtworkPlaceholder", () => {
  it("keeps the stable fallback until the decoded artwork has loaded", async () => {
    const { container } = render(
      <ArtworkPlaceholder title="Glass Signals" artworkKey="artwork:key" />,
    );
    const frame = container.querySelector(".artwork-placeholder");

    expect(frame).toHaveTextContent("GS");
    expect(frame).not.toHaveAttribute("data-has-artwork");

    await waitFor(() =>
      expect(container.querySelector("img")).toBeInTheDocument(),
    );
    expect(frame).toHaveAttribute("data-loading", "true");
    fireEvent.load(container.querySelector("img")!);

    expect(frame).toHaveAttribute("data-has-artwork", "true");
    expect(frame).not.toHaveAttribute("data-loading");
  });
});
