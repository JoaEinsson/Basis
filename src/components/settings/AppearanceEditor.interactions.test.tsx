import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteTheme: vi.fn(),
  duplicateTheme: vi.fn(),
  exportTheme: vi.fn(),
  getEditableTheme: vi.fn(),
  getThemeTokenRegistry: vi.fn(),
  importTheme: vi.fn(),
  resolveTheme: vi.fn(),
  saveThemeEdits: vi.fn(),
  clearPreview: vi.fn(),
  preview: vi.fn(),
  refresh: vi.fn(),
  select: vi.fn(),
  setFollowSystem: vi.fn(),
}));

vi.mock("../../lib/tauri", () => ({
  deleteTheme: mocks.deleteTheme,
  duplicateTheme: mocks.duplicateTheme,
  exportTheme: mocks.exportTheme,
  getEditableTheme: mocks.getEditableTheme,
  getThemeTokenRegistry: mocks.getThemeTokenRegistry,
  importTheme: mocks.importTheme,
  resolveTheme: mocks.resolveTheme,
  saveThemeEdits: mocks.saveThemeEdits,
}));

vi.mock("../../theme/ThemeProvider", () => ({
  useTheme: () => ({
    catalog: {
      themes: [
        {
          id: "custom:test",
          name: "Custom Test",
          appearance: "dark",
          basedOn: "builtin:nocturne",
          builtIn: false,
        },
      ],
      warnings: [],
    },
    selection: {
      lightSelection: "builtin:paper",
      darkSelection: "custom:test",
      followSystemAppearance: false,
    },
    activeAppearance: "dark",
    error: null,
    preview: mocks.preview,
    clearPreview: mocks.clearPreview,
    refresh: mocks.refresh,
    select: mocks.select,
    setFollowSystem: mocks.setFollowSystem,
  }),
}));

import { AppearanceEditor } from "./AppearanceEditor";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getThemeTokenRegistry.mockResolvedValue([
    {
      id: "color.background.canvas",
      label: "Canvas",
      category: "Color",
      kind: "color",
      minimum: null,
      maximum: null,
      defaultValue: "#000000",
    },
  ]);
  mocks.resolveTheme.mockResolvedValue({
    id: "builtin:nocturne",
    name: "Nocturne",
    appearance: "dark",
    tokens: { "color.background.canvas": "#000000" },
    warnings: [],
  });
  mocks.getEditableTheme.mockResolvedValue({
    id: "custom:test",
    name: "Custom Test",
    appearance: "dark",
    basedOn: "builtin:nocturne",
    builtIn: false,
    tokens: { "color.background.canvas": "#101010" },
  });
  mocks.select.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
});

it("shows dirty feedback and confirms before discarding theme edits", async () => {
  render(<AppearanceEditor libraryReady />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

  const name = await screen.findByRole("textbox", { name: "Theme name" });
  expect(screen.getByText("Saved")).toBeInTheDocument();
  fireEvent.change(name, { target: { value: "Changed Theme" } });
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(
    screen.getByRole("heading", { name: "Discard unsaved changes?" }),
  ).toBeInTheDocument();
  expect(mocks.clearPreview).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByDisplayValue("Changed Theme")).toBeInTheDocument();
});

it("confirms before deleting a custom theme", async () => {
  mocks.deleteTheme.mockResolvedValue({
    lightSelection: "builtin:paper",
    darkSelection: "builtin:nocturne",
    followSystemAppearance: false,
  });
  render(<AppearanceEditor libraryReady />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
  await screen.findByRole("textbox", { name: "Theme name" });

  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(mocks.deleteTheme).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete Theme" }));

  await waitFor(() =>
    expect(mocks.deleteTheme).toHaveBeenCalledWith("custom:test"),
  );
});
