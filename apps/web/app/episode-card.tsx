import Link from "next/link";
import type { ReactNode } from "react";
import { CardTitle } from "./card-title";
import { Poster } from "./poster";

export type Episode = { number: number; name: string; summary: string; still: string | null };

export function EpisodeCard({
  title,
  season,
  episode,
  children,
}: {
  title: string;
  season: number;
  episode: Episode;
  children?: ReactNode;
}) {
  const id = title + "/episodios/" + season + "/" + episode.number;
  const label = "Episódio " + episode.number;
  const name = episode.name || label;
  return (
    <li className="catalog-card" value={episode.number}>
      <Link className="card" href={"/obra/" + id} aria-label={episode.name ? label + ": " + name : label}>
        <Poster title={{ id, name, poster: episode.still }} />
        <CardTitle>{name}</CardTitle>
        {episode.name && <small>{label}</small>}
      </Link>
      {children}
    </li>
  );
}
