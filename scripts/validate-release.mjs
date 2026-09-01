import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauri = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const capabilities = JSON.parse(
  await readFile("src-tauri/capabilities/default.json", "utf8"),
);
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoLock = await readFile("src-tauri/Cargo.lock", "utf8");
const workflow = await readFile(".github/workflows/release.yml", "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const expectedEndpoint =
  "https://github.com/JoaEinsson/Basis/releases/latest/download/latest.json";
const errors = [];

if (packageJson.version !== tauri.version || cargoVersion !== tauri.version) {
  errors.push(
    "package.json, Cargo.toml, and tauri.conf.json versions must match",
  );
}
if (tauri.identifier !== "io.github.joaeinsson.basis") {
  errors.push("the locked bundle identifier changed");
}
if (tauri.bundle?.createUpdaterArtifacts !== true) {
  errors.push("bundle.createUpdaterArtifacts must be true");
}
if (!tauri.plugins?.updater?.endpoints?.includes(expectedEndpoint)) {
  errors.push("the locked GitHub Releases updater endpoint is missing");
}
const publicKey = tauri.plugins?.updater?.pubkey;
if (typeof publicKey !== "string" || publicKey.trim().length < 64) {
  errors.push("a real updater public key must be embedded in tauri.conf.json");
} else {
  try {
    const decoded = Buffer.from(publicKey, "base64").toString("utf8");
    if (!decoded.startsWith("untrusted comment: minisign public key:")) {
      errors.push("the updater public key is not a Tauri/minisign public key");
    }
  } catch {
    errors.push("the updater public key is not valid base64");
  }
}
for (const dependency of [
  "@tauri-apps/plugin-updater",
  "@tauri-apps/plugin-process",
]) {
  if (!packageJson.dependencies?.[dependency]) {
    errors.push(`${dependency} is missing`);
  }
}
for (const [npmName, rustName] of [
  ["@tauri-apps/plugin-updater", "tauri-plugin-updater"],
  ["@tauri-apps/plugin-process", "tauri-plugin-process"],
]) {
  const npmVersion =
    packageJson.dependencies?.[npmName]?.match(/\d+\.\d+/)?.[0];
  const rustVersion = lockedCargoVersion(cargoLock, rustName)?.match(
    /\d+\.\d+/,
  )?.[0];
  if (!npmVersion || !rustVersion || npmVersion !== rustVersion) {
    errors.push(
      `${npmName} and ${rustName} must resolve to the same major/minor version`,
    );
  }
}
for (const permission of ["updater:default", "process:allow-restart"]) {
  if (!capabilities.permissions?.includes(permission)) {
    errors.push(`${permission} is missing from the main-window capability`);
  }
}
for (const requiredWorkflowText of [
  "windows-latest",
  "--bundles nsis",
  "ubuntu-22.04",
  "--bundles appimage",
  "TAURI_SIGNING_PRIVATE_KEY",
  "releaseDraft: true",
  "gh release edit",
]) {
  if (!workflow.includes(requiredWorkflowText)) {
    errors.push(`release workflow is missing ${requiredWorkflowText}`);
  }
}

const tag =
  process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME;
if (tag && tag !== `v${tauri.version}`) {
  errors.push(`release tag ${tag} must equal v${tauri.version}`);
}

if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(
  `Basis v${tauri.version} release configuration is internally consistent.`,
);

function lockedCargoVersion(lockfile, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return lockfile.match(
    new RegExp(
      `\\[\\[package\\]\\]\\r?\\nname = "${escaped}"\\r?\\nversion = "([^"]+)"`,
    ),
  )?.[1];
}
