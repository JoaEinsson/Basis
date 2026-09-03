import { expect, it, vi } from "vitest";
import { scrollToSettingsSection } from "./Settings";

it("scrolls only the main canvas when navigating between Settings sections", () => {
  const canvas = document.createElement("main");
  canvas.className = "main-canvas";
  Object.defineProperty(canvas, "scrollTop", { value: 120, writable: true });
  canvas.getBoundingClientRect = vi.fn(() => rect(50));
  const scrollTo = vi.fn();
  canvas.scrollTo = scrollTo;

  const target = document.createElement("section");
  target.id = "settings-updates";
  target.getBoundingClientRect = vi.fn(() => rect(430));
  canvas.append(target);
  document.body.append(canvas);

  scrollToSettingsSection("settings-updates");

  expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
  canvas.remove();
});

function rect(top: number): DOMRect {
  return {
    bottom: top,
    height: 0,
    left: 0,
    right: 0,
    top,
    width: 0,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}
