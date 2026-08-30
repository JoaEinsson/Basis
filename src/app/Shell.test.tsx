import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewDefinition } from "../lib/types";
import { useNavigationStore } from "../stores/navigation";

const mocks = vi.hoisted(() => ({
  getLibraryStatus: vi.fn(),
  listViews: vi.fn(),
  onLibraryScanProgress: vi.fn(),
  searchLibrary: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
  chooseLibraryRoot: vi.fn(),
  getLibraryStatus: mocks.getLibraryStatus,
  listViews: mocks.listViews,
  onLibraryScanProgress: mocks.onLibraryScanProgress,
  searchLibrary: mocks.searchLibrary,
}));

import { AppShell } from "../components/shell/AppShell";

const albumsView: ViewDefinition = {
  schema_version: 1,
  id: "builtin:albums",
  name: "Albums",
  icon: null,
  entity: "album",
  query: { kind: "and", items: [] },
  group_by: [],
  sort: [{ field: "album", direction: "asc" }],
  layout: {
    kind: "grid",
    density: "comfortable",
    cover_size: 192,
    visible_fields: ["album", "albumArtist", "year"],
  },
  pin_to_sidebar: true,
};

describe("Basis definitive shell", () => {
  beforeEach(() => {
    useNavigationStore.setState({
      paletteOpen: false,
      scrollPositions: {},
      viewEntries: {},
    });
    mocks.getLibraryStatus.mockResolvedValue(null);
    mocks.listViews.mockResolvedValue([albumsView]);
    mocks.onLibraryScanProgress.mockResolvedValue(vi.fn());
    mocks.searchLibrary.mockResolvedValue({
      query: { kind: "text", value: "Sleep Token" },
      artists: [],
      albums: [],
      tracks: [],
      folders: [],
      genres: [],
      playlists: [],
      views: [],
    });
  });

  it("renders pinned Views in the top toolbar and has no permanent sidebar", async () => {
    const { container } = renderShell();
    expect(
      await screen.findByRole("link", { name: "Albums" }),
    ).toBeInTheDocument();
    expect(container.querySelector("aside")).toBeNull();
    expect(container.querySelector(".sidebar")).toBeNull();
  });

  it("opens the command palette with Ctrl+K independently of Search", async () => {
    renderShell();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      await screen.findByRole("dialog", { name: "Command palette" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("opens the main-canvas Search route with Ctrl+F", async () => {
    renderShell();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Search" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
  });

  it("restores the canvas scroll position for a Back history entry", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route
              index
              element={
                <HistoryPage destination="/second" label="Open second" />
              }
            />
            <Route
              path="second"
              element={<HistoryPage destination={-1} label="Return" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    const canvas = document.querySelector<HTMLElement>(".main-canvas");
    expect(canvas).not.toBeNull();
    if (!canvas) return;
    canvas.scrollTop = 137;
    fireEvent.click(screen.getByRole("button", { name: "Open second" }));
    expect(
      await screen.findByRole("button", { name: "Return" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    await waitFor(() => expect(canvas.scrollTop).toBe(137));
  });
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<p>Library canvas</p>} />
          <Route path="search" element={<h1>Search</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function HistoryPage({
  destination,
  label,
}: {
  destination: string | number;
  label: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() =>
        typeof destination === "number"
          ? navigate(destination)
          : navigate(destination)
      }
    >
      {label}
    </button>
  );
}
