"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/client-api";
import { barPercent, formatMinutes, monthLabels, ratingBuckets, toStars } from "../../lib/stats";
import { TitleCard, UserPageHeader, useTitles } from "../user-pages";
import { AnnualGoal, type Goal } from "./goal";

type Stats = {
  year: number;
  years: number[];
  viewings: number;
  distinctTitles: number;
  rewatches: number;
  minutes: number;
  byMonth: number[];
  byFormat: { movie?: number; tv?: number; anime?: number };
  topGenres: { name: string; count: number }[];
  averageRating: number | null;
  ratingHistogram: number[];
  topRated: { title: string; rating: number }[];
};
type Loaded = { year: number; stats: Stats | null; goal: Goal | null; statsError: string; goalError: string };

/** Ano atual no fuso de São Paulo (o mesmo padrão do backend). */
function currentYear() {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
}

/** Barras horizontais com rótulo e valor escritos (sem depender só da cor). */
function Bars({ rows, label }: { rows: { label: string; count: number }[]; label: string }) {
  const max = Math.max(0, ...rows.map((row) => row.count));
  return (
    <ul className="stats-bars" aria-label={label}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className="stats-bar-label">{row.label}</span>
          <span className="stats-bar-track" aria-hidden="true">
            <span className="stats-bar-fill" style={{ width: barPercent(row.count, max) + "%" }} />
          </span>
          <span className="stats-bar-value">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Página `/estatisticas`: retrospectiva do ano e meta anual. */
export function StatsPage() {
  const [year, setYear] = useState(currentYear),
    [loaded, setLoaded] = useState<Loaded | null>(null),
    [attempt, retry] = useState(0);
  const stats = loaded?.year === year ? loaded.stats : null;
  const known = useTitles(stats?.topRated.map((item) => item.title) ?? []);
  useEffect(() => {
    let active = true;
    Promise.allSettled([api<Stats>("me/stats?year=" + year), api<Goal>("me/goal?year=" + year)]).then(
      ([statsResult, goalResult]) => {
        if (!active) return;
        setLoaded({
          year,
          stats: statsResult.status === "fulfilled" ? statsResult.value : null,
          goal: goalResult.status === "fulfilled" ? goalResult.value : null,
          statsError: statsResult.status === "rejected" ? (statsResult.reason as Error).message : "",
          goalError: goalResult.status === "rejected" ? (goalResult.reason as Error).message : "",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [year, attempt]);
  const ready = loaded?.year === year;
  const years = [...new Set([currentYear(), year, ...(loaded?.stats?.years ?? [])])].sort((a, b) => b - a);
  const formats = stats
    ? [
        { label: "Filmes", count: stats.byFormat.movie ?? 0 },
        { label: "Séries", count: stats.byFormat.tv ?? 0 },
        { label: "Animes", count: stats.byFormat.anime ?? 0 },
      ]
    : [];
  const monthMax = Math.max(0, ...(stats?.byMonth ?? []));
  return (
    <main className="wrap friends-page stats-page">
      <UserPageHeader current="/estatisticas" />
      <div className="room-intro stats-intro">
        <div>
          <span className="room-eyebrow">SUA RETROSPECTIVA</span>
          <h1>Estatísticas de {year}</h1>
          <p>Tudo o que você registrou no Diário durante o ano. Sessões sem data ficam de fora.</p>
        </div>
        <label className="stats-year">
          Ano
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!ready && <p role="status">Carregando estatísticas…</p>}
      {ready && loaded.goalError && (
        <p role="alert" className="message error">
          Meta: {loaded.goalError}
        </p>
      )}
      {ready && loaded.goal && (
        <AnnualGoal
          key={year}
          goal={loaded.goal}
          onSaved={(goal) => setLoaded((old) => (old && old.year === goal.year ? { ...old, goal } : old))}
        />
      )}
      {ready && loaded.statsError && (
        <p role="alert" className="message error">
          {loaded.statsError} <button onClick={() => retry((n) => n + 1)}>Tentar novamente</button>
        </p>
      )}
      {stats && !stats.viewings && (
        <section className="panel">
          <p className="muted">
            Nenhuma sessão com data registrada em {year}. Marque obras como vistas ou registre sessões no Diário para
            montar sua retrospectiva.
          </p>
        </section>
      )}
      {stats && stats.viewings > 0 && (
        <>
          <section className="stats-tiles" aria-label="Totais do ano">
            {[
              ["Sessões", String(stats.viewings)],
              ["Obras diferentes", String(stats.distinctTitles)],
              ["Revisões", String(stats.rewatches)],
              ["Tempo em filmes", formatMinutes(stats.minutes)],
            ].map(([label, value]) => (
              <div className="stats-tile" key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
          <section className="panel" aria-labelledby="stats-months">
            <h2 id="stats-months">Sessões por mês</h2>
            <ol className="stats-months">
              {stats.byMonth.map((count, index) => (
                <li key={monthLabels[index]} aria-label={monthLabels[index] + ": " + count + " sessões"}>
                  <span className="stats-month-value" aria-hidden="true">
                    {count || ""}
                  </span>
                  <span className="stats-month-track" aria-hidden="true">
                    <span className="stats-month-fill" style={{ height: barPercent(count, monthMax) + "%" }} />
                  </span>
                  <span className="stats-month-label" aria-hidden="true">
                    {monthLabels[index]}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <div className="stats-columns">
            <section className="panel" aria-labelledby="stats-formats">
              <h2 id="stats-formats">Por formato</h2>
              <p className="muted">Obras diferentes vistas no ano.</p>
              <Bars rows={formats} label="Obras por formato" />
            </section>
            <section className="panel" aria-labelledby="stats-genres">
              <h2 id="stats-genres">Gêneros favoritos</h2>
              {stats.topGenres.length ? (
                <Bars rows={stats.topGenres.map((g) => ({ label: g.name, count: g.count }))} label="Obras por gênero" />
              ) : (
                <p className="muted">Sem gêneros no catálogo para estas obras.</p>
              )}
            </section>
          </div>
          <section className="panel" aria-labelledby="stats-ratings">
            <h2 id="stats-ratings">Suas notas</h2>
            {stats.averageRating === null ? (
              <p className="muted">
                Nenhum filme visto no ano tem nota. Séries são avaliadas por episódio e não entram aqui.
              </p>
            ) : (
              <>
                <p className="stats-average">
                  <strong>{toStars(stats.averageRating)}★</strong> de média
                  <small> · filmes vistos no ano; séries são avaliadas por episódio</small>
                </p>
                <Bars rows={ratingBuckets(stats.ratingHistogram).reverse()} label="Quantidade de obras por nota" />
              </>
            )}
          </section>
          {stats.topRated.length > 0 && (
            <section className="panel" aria-labelledby="stats-top">
              <h2 id="stats-top">Mais bem avaliados</h2>
              <div className="grid">
                {stats.topRated.map((item) => (
                  <TitleCard key={item.title} id={item.title} title={known[item.title]}>
                    <span className="review-score">★ {toStars(item.rating)}</span>
                  </TitleCard>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
