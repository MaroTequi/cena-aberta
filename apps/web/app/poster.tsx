"use client";
import { useState } from "react";

export function Poster({
  title,
  large = false,
}: {
  title: { id: string; name: string; poster: string | null };
  large?: boolean;
}) {
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const variant = Array.from(title.id).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 6;
  return (
    <div className={`poster art-${variant} ${large ? "poster-large" : ""}`}>
      {title.poster && title.poster !== failedPoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={title.poster}
          alt={large ? "Pôster de " + title.name : ""}
          loading={large ? "eager" : "lazy"}
          onError={() => setFailedPoster(title.poster)}
        />
      ) : (
        <>
          <i className="sun" />
          <i className="terrain" />
          <span>{title.name}</span>
        </>
      )}
    </div>
  );
}
