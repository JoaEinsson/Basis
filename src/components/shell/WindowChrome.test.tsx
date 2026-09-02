import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WindowChrome } from "./WindowChrome";
import { createWindowAdapter, type WindowAdapter } from "./windowAdapter";

describe("WindowChrome", () => {
  it("keeps browser previews inert without hiding the window controls", async () => {
    const adapter = createWindowAdapter();
    expect(adapter.available).toBe(false);

    render(<WindowChrome windowAdapter={adapter}>Toolbar</WindowChrome>);
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByText("Toolbar")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Window controls" }),
    ).toBeInTheDocument();
  });

  it("routes controls and the dedicated drag region through the adapter", async () => {
    const stop = vi.fn();
    let publishMaximized: ((value: boolean) => void) | undefined;
    const adapter = fakeAdapter({
      subscribeMaximized: vi.fn(async (listener) => {
        publishMaximized = listener;
        return stop;
      }),
    });
    const { container, unmount } = render(
      <WindowChrome windowAdapter={adapter}>Toolbar</WindowChrome>,
    );

    await waitFor(() => expect(adapter.isMaximized).toHaveBeenCalled());
    const dragRegion = container.querySelector<HTMLElement>(
      ".window-drag-region",
    );
    expect(dragRegion).not.toBeNull();
    if (!dragRegion) return;

    fireEvent.mouseDown(dragRegion, { button: 0, detail: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(adapter.startDragging).toHaveBeenCalledOnce();
      expect(adapter.minimize).toHaveBeenCalledOnce();
      expect(adapter.close).toHaveBeenCalledOnce();
    });

    act(() => publishMaximized?.(true));
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    fireEvent.doubleClick(dragRegion);
    await waitFor(() => expect(adapter.toggleMaximize).toHaveBeenCalledOnce());

    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("synchronizes the maximize button immediately after its action", async () => {
    const adapter = fakeAdapter();
    vi.mocked(adapter.isMaximized)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    render(<WindowChrome windowAdapter={adapter}>Toolbar</WindowChrome>);

    fireEvent.click(await screen.findByRole("button", { name: "Maximize" }));

    expect(
      await screen.findByRole("button", { name: "Restore" }),
    ).toBeInTheDocument();
  });
});

function fakeAdapter(overrides: Partial<WindowAdapter> = {}): WindowAdapter {
  return {
    available: true,
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    minimize: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    subscribeMaximized: vi.fn().mockResolvedValue(vi.fn()),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
