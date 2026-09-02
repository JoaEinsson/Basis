import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getThemeSelection: vi.fn(),
  listThemes: vi.fn(),
  resolveTheme: vi.fn(),
  setThemeSelection: vi.fn(),
}));

vi.mock("../lib/tauri", () => mocks);

import type {
  ResolvedTheme,
  ThemeAppearance,
  ThemeSelectionDto,
} from "../lib/types";
import { ThemeProvider, useTheme } from "./ThemeProvider";

const baseSelection: ThemeSelectionDto = {
  lightSelection: "builtin:paper",
  darkSelection: "builtin:nocturne",
  followSystemAppearance: false,
};

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("basis.theme.manualAppearance", "dark");
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.themeId;
    delete document.documentElement.dataset.themeAppearance;
    mocks.getThemeSelection.mockResolvedValue(baseSelection);
    mocks.listThemes.mockResolvedValue({
      themes: [
        summary("builtin:paper", "Paper", "light"),
        summary("builtin:nocturne", "Nocturne", "dark"),
        summary("builtin:chromatic", "Chromatic", "dark"),
        summary("custom:divergent", "Divergent", "dark", false),
      ],
      warnings: [],
    });
    mocks.resolveTheme.mockImplementation(async (id: string) => resolved(id));
    mocks.setThemeSelection.mockImplementation(
      async (appearance: ThemeAppearance, id: string, follow: boolean) => ({
        ...baseSelection,
        lightSelection:
          appearance === "light" ? id : baseSelection.lightSelection,
        darkSelection: appearance === "dark" ? id : baseSelection.darkSelection,
        followSystemAppearance: follow,
      }),
    );
  });

  it("switches all built-ins live while preserving the navigation DOM", async () => {
    const { container } = render(
      <ThemeProvider enabled>
        <Harness />
      </ThemeProvider>,
    );
    await waitFor(() =>
      expect(document.documentElement.dataset.themeId).toBe("builtin:nocturne"),
    );
    const navigation = container.querySelector("nav");
    expect(navigation).not.toBeNull();
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-accent"),
    ).toBe("#49d9c7");

    fireEvent.click(screen.getByRole("button", { name: "Paper" }));
    await waitFor(() =>
      expect(document.documentElement.dataset.themeId).toBe("builtin:paper"),
    );
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-canvas"),
    ).toBe("#f7f7f5");
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-titlebar"),
    ).toBe("#ffffff");
    expect(container.querySelector("nav")).toBe(navigation);

    fireEvent.click(screen.getByRole("button", { name: "Chromatic" }));
    await waitFor(() =>
      expect(document.documentElement.dataset.themeId).toBe(
        "builtin:chromatic",
      ),
    );
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-accent"),
    ).toBe("#ff4f9a");
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-titlebar"),
    ).toBe("");
    expect(container.querySelector("nav")).toBe(navigation);

    fireEvent.click(screen.getByRole("button", { name: "Divergent" }));
    await waitFor(() =>
      expect(document.documentElement.dataset.themeId).toBe("custom:divergent"),
    );
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-bg-canvas"),
    ).toBe("#102030");
    expect(
      document.documentElement.style.getPropertyValue("--mv-color-accent"),
    ).toBe("#ffb000");
    expect(container.querySelector("nav")).toBe(navigation);
  });
});

function Harness() {
  const theme = useTheme();
  return (
    <>
      <nav aria-label="Stable navigation">
        <a href="#library">Library</a>
      </nav>
      <main>
        <h1>Albums</h1>
      </main>
      <button
        type="button"
        onClick={() => void theme.select("light", "builtin:paper")}
      >
        Paper
      </button>
      <button
        type="button"
        onClick={() => void theme.select("dark", "builtin:chromatic")}
      >
        Chromatic
      </button>
      <button
        type="button"
        onClick={() => void theme.select("dark", "custom:divergent")}
      >
        Divergent
      </button>
    </>
  );
}

function summary(
  id: string,
  name: string,
  appearance: ThemeAppearance,
  builtIn = true,
) {
  return { id, name, appearance, basedOn: null, builtIn };
}

function resolved(id: string): ResolvedTheme {
  const paper = id === "builtin:paper";
  const chromatic = id === "builtin:chromatic";
  const divergent = id === "custom:divergent";
  return {
    id,
    name: id.split(":")[1],
    appearance: paper ? "light" : "dark",
    tokens: {
      "color.background.canvas": divergent
        ? "#102030"
        : paper
          ? "#f7f7f5"
          : "#0c0d10",
      "color.background.surface": paper ? "#ffffff" : "#15171c",
      ...(paper ? { "color.background.titlebar": "#ffffff" } : {}),
      "color.text.primary": paper ? "#202124" : "#f4f5f7",
      "color.accent.primary": divergent
        ? "#ffb000"
        : chromatic
          ? "#ff4f9a"
          : paper
            ? "#4056b4"
            : "#49d9c7",
      "density.scale": 1,
      "density.controlHeight": 36,
      "density.trackRowHeight": 54,
      "type.scale": 1,
    },
    warnings: [],
  };
}
