import { useEffect, useState } from "react";
import { getArtworkThumbnail } from "../../lib/tauri";
import { ArtworkFrame } from "../ui";

type ArtworkPlaceholderProps = {
  title: string;
  artworkKey?: string | null;
  seed?: string;
  className?: string;
};

export function ArtworkPlaceholder({
  title,
  artworkKey,
  seed,
  className = "",
}: ArtworkPlaceholderProps) {
  const [source, setSource] = useState<string | null>(null);
  const letters = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (!artworkKey) {
      setSource(null);
      return;
    }
    let active = true;
    void loadThumbnail(artworkKey).then((next) => {
      if (active) setSource(next);
    });
    return () => {
      active = false;
    };
  }, [artworkKey]);

  return (
    <ArtworkFrame
      className={`artwork-placeholder ${className}`.trim()}
      data-artwork-key={artworkKey ?? undefined}
      hasArtwork={Boolean(source)}
      style={
        {
          "--mv-artwork-seed-angle": `${seedAngle(seed ?? artworkKey ?? title)}deg`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {source ? <img alt="" src={source} /> : <span>{letters || "B"}</span>}
    </ArtworkFrame>
  );
}

const thumbnailCache = new Map<string, Promise<string | null>>();

function loadThumbnail(key: string) {
  const cached = thumbnailCache.get(key);
  if (cached) return cached;
  const request = getArtworkThumbnail(key, 256).catch(() => null);
  thumbnailCache.set(key, request);
  return request;
}

function seedAngle(seed: string) {
  let hash = 2_166_136_261;
  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return Math.abs(hash) % 360;
}
