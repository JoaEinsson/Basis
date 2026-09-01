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

export function createUpdaterManifest({
  tag,
  repository,
  pubDate,
  notes,
  linux,
  windows,
}) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`Invalid stable release tag: ${tag}`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
  for (const [platform, artifact] of Object.entries({ linux, windows })) {
    if (
      !artifact ||
      typeof artifact.file !== "string" ||
      artifact.file.includes("/") ||
      artifact.file.includes("\\")
    ) {
      throw new Error(`Invalid ${platform} updater filename`);
    }
    if (
      typeof artifact.signature !== "string" ||
      artifact.signature.trim().length < 32
    ) {
      throw new Error(`Invalid ${platform} updater signature`);
    }
  }

  const linuxArtifact = releaseArtifact(repository, tag, linux);
  const windowsArtifact = releaseArtifact(repository, tag, windows);
  return {
    version: tag.slice(1),
    notes,
    pub_date: pubDate,
    platforms: {
      "linux-x86_64": linuxArtifact,
      "linux-x86_64-appimage": linuxArtifact,
      "windows-x86_64": windowsArtifact,
      "windows-x86_64-nsis": windowsArtifact,
    },
  };
}

function releaseArtifact(repository, tag, artifact) {
  return {
    signature: artifact.signature.trim(),
    url: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(artifact.file)}`,
  };
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
