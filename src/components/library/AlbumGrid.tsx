import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { AlbumDto, ViewDensity } from "../../lib/types";
import { ArtworkPlaceholder } from "./ArtworkPlaceholder";

type AlbumGridProps = {
  albums: AlbumDto[];
  coverSize?: number | null;
  density?: ViewDensity;
};

export function AlbumGrid({
  albums,
  coverSize,
  density = "comfortable",
}: AlbumGridProps) {
  const style = coverSize
    ? ({ "--mv-view-cover-size": `${coverSize}px` } as CSSProperties)
    : undefined;

  return (
    <div className="album-grid" data-density={density} style={style}>
      {albums.map((album) => (
        <Link
          className="album-tile"
          to={`/albums/${album.albumKey}`}
          key={album.albumKey}
        >
          <ArtworkPlaceholder
            className="album-artwork"
            title={album.title}
            artworkKey={album.artworkKey}
            seed={album.albumKey}
          />
          <span className="entity-title" title={album.title}>
            {album.title}
          </span>
          <span className="entity-subtitle" title={album.albumArtist}>
            {album.albumArtist}
            {album.year === null ? "" : ` · ${album.year}`}
          </span>
        </Link>
      ))}
    </div>
  );
}
