import { readFile } from "node:fs/promises";
import { validateUpdaterManifest } from "./updater-manifest.mjs";

const [manifestPath, expectedVersion] = process.argv.slice(2);
if (!manifestPath) {
  console.error(
    "Usage: pnpm release:manifest <latest.json> [expected-version]",
  );
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  console.error(`Could not read updater manifest: ${error.message}`);
  process.exit(1);
}

const errors = validateUpdaterManifest(manifest, expectedVersion);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("Updater manifest contains signed Windows and Linux artifacts.");
