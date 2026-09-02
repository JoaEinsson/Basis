import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ArtworkFrame,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  Divider,
  DragHandle,
  DragPreview,
  DropTarget,
  EmptyState,
  EntityRow,
  FilterChip,
  IconButton,
  IconSwap,
  InlineStatus,
  InsertionMarker,
  LocalErrorState,
  MenuItem,
  MenuSurface,
  Popover,
  Progress,
  RangeInput,
  ScrollRegion,
  SearchInput,
  SegmentedControl,
  SelectInput,
  Skeleton,
  Tabs,
  TextArea,
  TextInput,
  Toggle,
  Tooltip,
} from ".";

describe("shared UI primitives", () => {
  it("exposes themed button variants and accessible icon controls", () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="destructive">Delete</Button>
        <Tooltip label="More actions">
          <IconButton aria-label="More actions">…</IconButton>
        </Tooltip>
      </>,
    );

    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "data-variant",
      "primary",
    );
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    const iconButton = screen.getByRole("button", { name: "More actions" });
    expect(iconButton).toHaveAttribute(
      "aria-describedby",
      screen.getByRole("tooltip").id,
    );
  });

  it("traps dialog focus, closes from Escape, and restores the trigger", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open dialog
          </button>
          {open && (
            <Dialog ariaLabel="Edit item" onClose={() => setOpen(false)}>
              <input aria-label="Name" />
              <DialogActions>
                <button type="button">Cancel</button>
                <button type="button">Save</button>
              </DialogActions>
            </Dialog>
          )}
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);
    const name = await screen.findByRole("textbox", { name: "Name" });
    await waitFor(() => expect(name).toHaveFocus());

    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.keyDown(save, { key: "Tab" });
    expect(name).toHaveFocus();
    fireEvent.keyDown(name, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports menu roving focus and dismisses from Escape", async () => {
    const close = vi.fn();
    render(
      <MenuSurface ariaLabel="Actions" onClose={close}>
        <MenuItem>First</MenuItem>
        <MenuItem>Second</MenuItem>
      </MenuSurface>,
    );

    const first = screen.getByRole("menuitem", { name: "First" });
    const second = screen.getByRole("menuitem", { name: "Second" });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });

  it("opens and dismisses a labelled popover", () => {
    render(
      <Popover ariaLabel="Column options" trigger={<Button>Columns</Button>}>
        Options
      </Popover>,
    );

    const trigger = screen.getByRole("button", { name: "Columns" });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Column options" }),
    ).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves segmented selection with arrows and keeps radio semantics", () => {
    function Harness() {
      const [value, setValue] = useState<"grid" | "list">("grid");
      return (
        <SegmentedControl
          ariaLabel="Representation"
          value={value}
          onChange={setValue}
          options={[
            { label: "Grid", value: "grid" },
            { label: "List", value: "list" },
          ]}
        />
      );
    }

    render(<Harness />);
    const grid = screen.getByRole("radio", { name: "Grid" });
    const list = screen.getByRole("radio", { name: "List" });
    expect(grid).toBeChecked();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(list).toBeChecked();
    expect(list).toHaveFocus();
  });

  it("moves tab selection without creating a second interaction model", () => {
    function Harness() {
      const [value, setValue] = useState<"lyrics" | "credits">("lyrics");
      return (
        <Tabs
          ariaLabel="Track information"
          value={value}
          onChange={setValue}
          options={[
            { label: "Lyrics", value: "lyrics" },
            { label: "Credits", value: "credits" },
          ]}
        />
      );
    }

    render(<Harness />);
    const lyrics = screen.getByRole("tab", { name: "Lyrics" });
    const credits = screen.getByRole("tab", { name: "Credits" });
    fireEvent.keyDown(lyrics, { key: "ArrowRight" });
    expect(credits).toHaveAttribute("aria-selected", "true");
    expect(credits).toHaveFocus();
  });

  it("models form, feedback, collection, and drag states", () => {
    const retry = vi.fn();
    render(
      <>
        <Checkbox defaultChecked>Follow system appearance</Checkbox>
        <Toggle defaultChecked>Automatic updates</Toggle>
        <TextInput aria-label="Name" />
        <SearchInput aria-label="Search" />
        <TextArea aria-label="Description" />
        <SelectInput aria-label="Density" defaultValue="compact">
          <option value="compact">Compact</option>
        </SelectInput>
        <RangeInput aria-label="Cover size" defaultValue="50" />
        <FilterChip active>Rock</FilterChip>
        <Badge tone="accent">Synced</Badge>
        <Progress label="Indexing" value={40} />
        <Skeleton label="Loading albums" />
        <InlineStatus tone="success">Ready</InlineStatus>
        <EmptyState title="No results">Try another filter.</EmptyState>
        <LocalErrorState onRetry={retry}>Could not load.</LocalErrorState>
        <ArtworkFrame hasArtwork>cover</ArtworkFrame>
        <EntityRow selected playing>
          Track
        </EntityRow>
        <DropTarget active>Drop here</DropTarget>
        <DragPreview dragging>
          <DragHandle aria-label="Reorder track">::</DragHandle>
        </DragPreview>
        <InsertionMarker active />
        <Divider />
        <ScrollRegion>Scrollable</ScrollRegion>
        <IconSwap active inactiveIcon="off" activeIcon="on" />
      </>,
    );

    expect(
      screen.getByRole("checkbox", { name: "Follow system appearance" }),
    ).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "Automatic updates" }),
    ).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveClass(
      "ui-search-input",
    );
    const range = screen.getByRole("slider", { name: "Cover size" });
    expect(range).toHaveStyle({
      "--ui-range-progress": "50%",
    });
    fireEvent.input(range, { target: { value: "75" } });
    expect(range).toHaveStyle({ "--ui-range-progress": "75%" });
    expect(screen.getByRole("button", { name: "Rock" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("progressbar", { name: "Indexing" }),
    ).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("Track").closest(".ui-entity-row")).toHaveAttribute(
      "data-selected",
    );
    expect(screen.getByText("Drop here")).toHaveAttribute("data-drop-active");
    expect(document.querySelector(".ui-insertion-marker")).toHaveAttribute(
      "data-active",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
