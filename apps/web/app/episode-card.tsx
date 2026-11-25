import type {ReactNode} from "react";

export type Episode = {number:number; name:string; summary:string};

export function EpisodeCard({episode, children}: {episode:Episode; children?:ReactNode}) {
  return <li className="episode-card" value={episode.number}>
    <strong>Episódio {episode.number}{episode.name && " · " + episode.name}</strong>
    {children}
    {episode.summary && <details><summary>Sinopse</summary><p>{episode.summary}</p></details>}
  </li>;
}
