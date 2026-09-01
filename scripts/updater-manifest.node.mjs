import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateUpdaterManifest } from "./updater-manifest.mjs";

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
