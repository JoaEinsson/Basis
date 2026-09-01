import { readdir, readFile, writeFile } from "node:fs/promises";
import { createUpdaterManifest } from "./updater-manifest.mjs";

const [assetDirectory, tag, repository, outputPath = "latest.json"] =
  process.argv.slice(2);
if (!assetDirectory || !tag || !repository) {
  console.error(
    "Usage: node scripts/finalize-updater-manifest.mjs <asset-directory> <tag> <owner/repository> [output]",
  );
  process.exit(2);
}

const entries = await readdir(assetDirectory);
const linuxSignatureFile = exactlyOne(
  entries.filter((name) => name.endsWith(".AppImage.sig")),
  "AppImage signature",
);
const windowsSignatureFile = exactlyOne(
  entries.filter((name) => name.endsWith("-setup.exe.sig")),
  "NSIS signature",
);
const linuxFile = linuxSignatureFile.slice(0, -4);
const windowsFile = windowsSignatureFile.slice(0, -4);
const linuxSignature = (
  await readFile(`${assetDirectory}/${linuxSignatureFile}`, "utf8")
).trim();
const windowsSignature = (
  await readFile(`${assetDirectory}/${windowsSignatureFile}`, "utf8")
).trim();

const manifest = createUpdaterManifest({
  tag,
  repository,
  pubDate: new Date().toISOString(),
  notes: `Basis ${tag.replace(/^v/, "")} stable release.`,
  linux: { file: linuxFile, signature: linuxSignature },
  windows: { file: windowsFile, signature: windowsSignature },
});
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Finalized ${outputPath} from the verified release assets.`);

function exactlyOne(items, description) {
  if (items.length !== 1) {
    throw new Error(
      `Expected exactly one ${description}, found ${items.length}.`,
    );
  }
  return items[0];
}
