import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const tauri = JSON.parse(await readFile("src-tauri/tauri.conf.json", "utf8"));
const capabilities = JSON.parse(
  await readFile("src-tauri/capabilities/default.json", "utf8"),
);
const license = await readFile("LICENSE", "utf8");
const cargo = await readFile("src-tauri/Cargo.toml", "utf8");
const cargoLock = await readFile("src-tauri/Cargo.lock", "utf8");
const workflow = await readFile(".github/workflows/release.yml", "utf8");
const appImageValidator = await readFile(
  "scripts/validate-appimage.sh",
  "utf8",
);
const appImageRepacker = await readFile("scripts/repack-appimage.sh", "utf8");
const minisignInstaller = await readFile("scripts/install-minisign.sh", "utf8");
const signatureVerifier = await readFile(
  "scripts/verify-updater-signatures.sh",
  "utf8",
);
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
const mainWindow = tauri.app?.windows?.find(
  (window) => window.label === "main",
);
if (mainWindow?.decorations !== false) {
  errors.push("the main window must use the unified custom window chrome");
}
if (
  packageJson.license !== "Apache-2.0" ||
  !/^license\s*=\s*"Apache-2.0"$/m.test(cargo) ||
  tauri.bundle?.license !== "Apache-2.0" ||
  tauri.bundle?.licenseFile !== "../LICENSE"
) {
  errors.push(
    "Node, Rust, and Tauri bundle metadata must apply the Apache-2.0 license",
  );
}
if (
  !/Apache License\r?\n\s+Version 2\.0/.test(license) ||
  !license.includes(
    "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION",
  )
) {
  errors.push("the root LICENSE file is not the Apache License 2.0 text");
}
const productionCsp = tauri.app?.security?.csp;
if (
  typeof productionCsp !== "string" ||
  !productionCsp.includes("object-src 'none'")
) {
  errors.push("the production CSP must deny object embedding");
}
if (/localhost|127\.0\.0\.1|ws:\/\//.test(productionCsp ?? "")) {
  errors.push("the production CSP contains a development network origin");
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
for (const permission of [
  "core:window:allow-close",
  "core:window:allow-minimize",
  "core:window:allow-start-dragging",
  "core:window:allow-toggle-maximize",
  "updater:default",
  "process:allow-restart",
]) {
  if (!capabilities.permissions?.includes(permission)) {
    errors.push(`${permission} is missing from the main-window capability`);
  }
}
const allowedPermissions = new Set([
  "core:default",
  "core:window:allow-close",
  "core:window:allow-minimize",
  "core:window:allow-start-dragging",
  "core:window:allow-toggle-maximize",
  "updater:default",
  "process:allow-restart",
]);
for (const permission of capabilities.permissions ?? []) {
  if (!allowedPermissions.has(permission)) {
    errors.push(`unexpected main-window capability: ${permission}`);
  }
}
for (const [file, width, height] of [
  ["src-tauri/icons/32x32.png", 32, 32],
  ["src-tauri/icons/64x64.png", 64, 64],
  ["src-tauri/icons/128x128.png", 128, 128],
  ["src-tauri/icons/128x128@2x.png", 256, 256],
  ["src-tauri/icons/icon.png", 512, 512],
]) {
  await validatePng(file, width, height, errors);
  if (file !== "src-tauri/icons/icon.png") {
    const relative = file.replace("src-tauri/", "");
    if (!tauri.bundle?.icon?.includes(relative)) {
      errors.push(`${relative} is missing from bundle.icon`);
    }
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
  "scripts/validate-appimage.sh",
  "scripts/repack-appimage.sh",
  "pnpm tauri signer sign",
  "scripts/install-minisign.sh",
  "scripts/verify-updater-signatures.sh",
  "scripts/finalize-updater-manifest.mjs",
  "pnpm audit --prod",
  "cargo audit --file src-tauri/Cargo.lock",
]) {
  if (!workflow.includes(requiredWorkflowText)) {
    errors.push(`release workflow is missing ${requiredWorkflowText}`);
  }
}
for (const forbiddenBundledLibrary of [
  "libEGL.so",
  "libGLES.so",
  "libwayland-",
]) {
  if (!appImageValidator.includes(forbiddenBundledLibrary)) {
    errors.push(`AppImage validation is missing ${forbiddenBundledLibrary}`);
  }
}
if (
  !appImageRepacker.includes("AppImage/appimagetool/releases/download/1.9.1") ||
  !appImageRepacker.includes(
    "ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0",
  )
) {
  errors.push("AppImage repacking must use the pinned appimagetool release");
}
if (
  !signatureVerifier.includes('minisign_command="${MINISIGN_BIN:-minisign}"') ||
  !signatureVerifier.includes('-Vm "$artifact"')
) {
  errors.push("final updater artifacts are not cryptographically verified");
}
if (
  !minisignInstaller.includes(
    "github.com/jedisct1/minisign/releases/download/${version}",
  ) ||
  !minisignInstaller.includes(
    "9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73",
  )
) {
  errors.push(
    "Minisign installation must use the pinned official Linux archive",
  );
}
if (/apt-get install[^\n]*minisign/.test(workflow)) {
  errors.push(
    "the Ubuntu 22.04 workflow cannot depend on an unavailable minisign package",
  );
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

async function validatePng(file, expectedWidth, expectedHeight, failures) {
  const bytes = await readFile(file);
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== signature) {
    failures.push(`${file} is not a valid PNG`);
    return;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  if (width !== expectedWidth || height !== expectedHeight) {
    failures.push(
      `${file} must be ${expectedWidth}x${expectedHeight}, found ${width}x${height}`,
    );
  }
  if (colorType !== 4 && colorType !== 6) {
    failures.push(`${file} must preserve an alpha channel`);
  }
}
