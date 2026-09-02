import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/tokens.css";
import "./styles/global.css";

async function start() {
  if (import.meta.env.DEV) {
    const fixture = new URLSearchParams(window.location.search).get(
      "visual-fixture",
    );
    if (fixture) {
      const { installVisualFixture } = await import("./dev/visualFixture");
      await installVisualFixture(fixture);
    }
  }

  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Basis could not find its application root.");
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
