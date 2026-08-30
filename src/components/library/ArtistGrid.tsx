import { Link } from "react-router-dom";
import type { ArtistDto } from "../../lib/types";

export function ArtistGrid({ artists }: { artists: ArtistDto[] }) {
  return (
    <div className="artist-grid">
      {artists.map((artist) => (
        <Link
          className="artist-entity"
          to={`/artists/${artist.artistKey}`}
          key={artist.artistKey}
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
        </Link>
      ))}
    </div>
  );
}
