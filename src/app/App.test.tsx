import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LibraryContext } from "../components/shell/LibraryContext";
import { Onboarding } from "../pages/Onboarding";

describe("Basis library empty state", () => {
  it("is a quiet product state without dashboard or bridge copy", () => {
    render(
      <MemoryRouter>
        <LibraryContext.Provider
          value={{
            library: null,
            scan: null,
            libraryError: null,
            views: [],
            choosingLibrary: false,
            chooseLibrary: vi.fn(),
            refreshViews: vi.fn(),
            replaceViews: vi.fn(),
          }}
        >
          <Onboarding />
        </LibraryContext.Provider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "No music folder added." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add folder" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/desktop bridge/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/your music folder stays yours/i),
    ).not.toBeInTheDocument();
  });
});
