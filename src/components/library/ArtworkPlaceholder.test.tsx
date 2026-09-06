import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getArtworkThumbnail: vi.fn(),
}));

vi.mock("../../lib/tauri", () => mocks);

import { ArtworkPlaceholder } from "./ArtworkPlaceholder";

describe("ArtworkPlaceholder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getArtworkThumbnail.mockResolvedValue(
      "data:image/webp;base64,fixture",
    );
  });

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
    expect(mocks.getArtworkThumbnail).toHaveBeenCalledWith("artwork:key", 256);
  });

  it("keeps separate cache requests for high-DPI hero artwork", async () => {
    const { container } = render(
      <>
        <ArtworkPlaceholder
          title="Glass Signals card"
          artworkKey="artwork:shared"
        />
        <ArtworkPlaceholder
          title="Glass Signals hero"
          artworkKey="artwork:shared"
          dimension={512}
        />
      </>,
    );

    await waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(2),
    );
    expect(mocks.getArtworkThumbnail).toHaveBeenCalledWith(
      "artwork:shared",
      256,
    );
    expect(mocks.getArtworkThumbnail).toHaveBeenCalledWith(
      "artwork:shared",
      512,
    );
  });
});
