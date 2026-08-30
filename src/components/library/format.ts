export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) {
    return "—";
  }
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function displayTrackTitle(
  title: string | null,
  relativePath: string,
): string {
  if (title?.trim()) {
    return title;
  }
  const filename = relativePath.split("/").at(-1) ?? relativePath;
  return filename.replace(/\.[^.]+$/, "");
}
