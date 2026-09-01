const REQUIRED_PLATFORMS = ["linux-x86_64", "windows-x86_64"];

export function validateUpdaterManifest(manifest, expectedVersion) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be a JSON object"];
  }
  if (typeof manifest.version !== "string" || !isSemver(manifest.version)) {
    errors.push("version must be a stable semantic version");
  } else if (
    expectedVersion &&
    stripVersionPrefix(manifest.version) !== stripVersionPrefix(expectedVersion)
  ) {
    errors.push(
      `manifest version ${manifest.version} does not match ${expectedVersion}`,
    );
  }
  if (!manifest.platforms || typeof manifest.platforms !== "object") {
    errors.push("platforms must be an object");
    return errors;
  }
  for (const platform of REQUIRED_PLATFORMS) {
    const artifact = manifest.platforms[platform];
    if (!artifact || typeof artifact !== "object") {
      errors.push(`missing ${platform} updater artifact`);
      continue;
    }
    if (!isHttpsUrl(artifact.url)) {
      errors.push(`${platform} URL must use HTTPS`);
    }
    if (
      typeof artifact.signature !== "string" ||
      artifact.signature.trim().length < 32
    ) {
      errors.push(`${platform} signature is missing or invalid`);
    }
  }
  return errors;
}

function isHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isSemver(value) {
  return /^v?\d+\.\d+\.\d+$/.test(value);
}

function stripVersionPrefix(value) {
  return value.startsWith("v") ? value.slice(1) : value;
}
