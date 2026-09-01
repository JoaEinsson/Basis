import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createUpdaterManifest,
  validateUpdaterManifest,
} from "./updater-manifest.mjs";

const signature = "trusted-signature-material".repeat(3);

test("accepts the checked-in manifest backed by the signed artifact fixture", async () => {
  const manifest = JSON.parse(
    await readFile("fixtures/updater/latest.json", "utf8"),
  );
  assert.deepEqual(validateUpdaterManifest(manifest, "v99.0.0"), []);
});

test("accepts a complete stable Windows and Linux manifest", () => {
  assert.deepEqual(
    validateUpdaterManifest(
      {
        version: "0.2.0",
        platforms: {
          "windows-x86_64": {
            url: "https://github.com/JoaEinsson/Basis/releases/download/v0.2.0/Basis.exe",
            signature,
          },
          "linux-x86_64": {
            url: "https://github.com/JoaEinsson/Basis/releases/download/v0.2.0/Basis.AppImage",
            signature,
          },
        },
      },
      "v0.2.0",
    ),
    [],
  );
});

test("rejects missing signatures, insecure URLs, targets, and version drift", () => {
  const errors = validateUpdaterManifest(
    {
      version: "0.2.1-beta.1",
      platforms: {
        "windows-x86_64": { url: "http://example.test/Basis.exe" },
      },
    },
    "0.2.0",
  );
  assert.ok(errors.some((error) => error.includes("semantic version")));
  assert.ok(errors.some((error) => error.includes("HTTPS")));
  assert.ok(errors.some((error) => error.includes("signature")));
  assert.ok(errors.some((error) => error.includes("linux-x86_64")));
});

test("creates stable browser-download metadata from final signed assets", () => {
  const manifest = createUpdaterManifest({
    tag: "v0.2.0",
    repository: "JoaEinsson/Basis",
    pubDate: "2026-09-01T00:00:00.000Z",
    notes: "Basis 0.2.0 stable release.",
    linux: {
      file: "Basis_0.2.0_amd64.AppImage",
      signature,
    },
    windows: {
      file: "Basis_0.2.0_x64-setup.exe",
      signature,
    },
  });

  assert.deepEqual(validateUpdaterManifest(manifest, "v0.2.0"), []);
  assert.equal(
    manifest.platforms["linux-x86_64"].url,
    "https://github.com/JoaEinsson/Basis/releases/download/v0.2.0/Basis_0.2.0_amd64.AppImage",
  );
  assert.equal(
    manifest.platforms["windows-x86_64"].url,
    "https://github.com/JoaEinsson/Basis/releases/download/v0.2.0/Basis_0.2.0_x64-setup.exe",
  );
});
