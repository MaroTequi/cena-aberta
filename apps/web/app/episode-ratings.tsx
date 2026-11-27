"use client";
import { useEffect, useState } from "react";
import { StarRating } from "./star-rating";

import { EpisodeCard, type Episode } from "./episode-card";
type SeasonAverage = { season: number; average: number };
const score = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " / 5";

export function EpisodeRatings({
  title,
  season,
  allowRating,
  onSaved,
}: {
  title: string;
  season: number;
  allowRating: boolean;
  onSaved: () => void;
}) {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverage[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [averagesFailed, setAveragesFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setAveragesFailed(false);
    fetch("/api/v1/me/episodes/" + title, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Falha ao carregar médias.");
        return response.json();
      })
      .then((result) => {
        if (current) setSeasonAverages(result);
      })
      .catch(() => {
        if (current) setAveragesFailed(true);
      });
    return () => {
      current = false;
    };
  }, [title, revision, retry]);
  const personalSeries = seasonAverages?.length
    ? Math.ceil(seasonAverages.reduce((sum, item) => sum + 2 * item.average, 0) / seasonAverages.length) / 2
    : null;
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    setEpisodes([]);
    Promise.all([
      fetch("/api/v1/titles/" + title + "/seasons/" + season),
      fetch("/api/v1/me/episodes/" + title + "/" + season),
    ])
      .then(async (responses) => {
        if (responses.some((response) => !response.ok)) throw new Error("Não foi possível carregar os episódios.");
        const [list, notes] = await Promise.all(responses.map((response) => response.json()));
        if (current) {
          setEpisodes(list);
          setRatings(
            Object.fromEntries(notes.map((note: { episode: number; rating: number }) => [note.episode, note.rating])),
          );
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [title, season, retry]);
  async function rate(episode: number, rating: number | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me/episodes/" + title + "/" + season + "/" + episode, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (!response.ok) throw new Error("Não foi possível salvar a nota. Tente novamente.");
      setRatings((previous) => {
        const next = { ...previous };
        if (rating === null) delete next[episode];
        else next[episode] = rating;
        return next;
      });
      setRevision((value) => value + 1);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="episodes-heading">
      <h2 id="episodes-heading">Episódios</h2>
      {averagesFailed ? (
        <p role="alert">
          Não foi possível carregar suas médias.{" "}
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      ) : (
        seasonAverages && (
          <p>
            <strong>Minha média da série</strong> ·{" "}
            {personalSeries === null ? "Sem notas por episódio" : score(personalSeries)}
          </p>
        )
      )}
      {loading && <p role="status">Carregando episódios…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRetry((value) => value + 1)} disabled={busy}>
            Tentar novamente
          </button>
        </p>
      )}
      {!loading && !error && !episodes.length && <p>Nenhum episódio disponível.</p>}
      {episodes.length > 0 && (
        <ol className={"grid series-episode-list" + (allowRating ? " episode-rating-grid" : "")}>
          {episodes.map((episode) => (
            <EpisodeCard key={episode.number} title={title} season={season} episode={episode}>
              {allowRating && (
                <StarRating
                  value={ratings[episode.number] ?? null}
                  disabled={busy || loading}
                  onChange={(value) => void rate(episode.number, value)}
                />
              )}
            </EpisodeCard>
          ))}
        </ol>
      )}
    </section>
  );
}
