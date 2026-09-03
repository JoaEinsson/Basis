import { ArrowUpRight } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { ArtistDto, ViewDensity } from "../../lib/types";

export function ArtistGrid({
  artists,
  density = "comfortable",
}: {
  artists: ArtistDto[];
  density?: ViewDensity;
}) {
  return (
    <div
      className="artist-grid"
      data-density={density}
      data-short-collection={artists.length <= 12 || undefined}
    >
      {artists.map((artist, index) => (
        <Link
          className="artist-entity"
          to={`/artists/${artist.artistKey}`}
          key={artist.artistKey}
          style={{ "--mv-collection-item-index": index } as CSSProperties}
        >
          <span className="artist-monogram" aria-hidden="true">
            {artist.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="entity-title">{artist.name}</span>
            <span className="entity-subtitle">
              {artist.albumCount} albums · {artist.trackCount} tracks
            </span>
          </span>
          <span className="entity-card-action" aria-hidden="true">
            Open artist <ArrowUpRight size={15} />
          </span>
        </Link>
      ))}
    </div>
  );
}
