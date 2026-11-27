"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { seasonHref, seasonName } from "../lib/work-links";
import { CardTitle } from "./card-title";
import { Poster } from "./poster";

type Season = { number: number; name: string; poster: string | null };

export function SeriesSeasons({ title }: { title: string }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch("/api/v1/titles/" + title + "/seasons", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((result) => {
        if (!controller.signal.aborted) setSeasons(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [title, attempt]);

  return (
    <section className="work-credits">
      <h3>Temporadas</h3>
      {failed ? (
        <p role="alert">
          Não foi possível carregar as temporadas.{" "}
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : !seasons ? (
        <p role="status">Carregando temporadas…</p>
      ) : seasons.length === 0 ? (
        <p>Nenhuma temporada disponível.</p>
      ) : (
        <ul className="grid series-episode-list">
          {seasons.map((season) => {
            const id = "season-" + title + "-s" + season.number;
            const label = seasonName(season.number);
            return (
              <li className="catalog-card" key={season.number}>
                <Link
                  href={seasonHref(title, season.number)}
                  className="card"
                  aria-label={season.name === label ? label : label + ": " + season.name}
                >
                  <Poster title={{ id, name: season.name, poster: season.poster }} />
                  <CardTitle>{season.name}</CardTitle>
                  {season.name !== label && <small>{label}</small>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
