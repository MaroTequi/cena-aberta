"use client";
import { useState, type ReactNode } from "react";
import type { Title } from "../lib/types";
export function CommunityScore({
  average,
  count,
  demo = false,
  episodic = false,
}: {
  average: number | null;
  count: number;
  demo?: boolean;
  episodic?: boolean;
}) {
  return (
    <div className="community-score">
      <div className="community-score-value">
        <strong>
          {average === null
            ? "–"
            : average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
        </strong>
        <span> / 5</span>
      </div>
      <div>
        <div className="community-stars" aria-hidden="true">
          ★★★★★<span style={{ width: (average ?? 0) * 20 + "%" }}>★★★★★</span>
        </div>
        <span className="muted">
          {episodic
            ? count === 0
              ? "Ainda não há notas públicas por episódio"
              : count + (count === 1 ? " pessoa avaliou" : " pessoas avaliaram")
            : count === 0
              ? "Ainda não há notas públicas"
              : demo
                ? count + " avaliações fictícias"
                : count + (count === 1 ? " avaliação pública" : " avaliações públicas")}
        </span>
      </div>
    </div>
  );
}
export { Poster } from "./poster";

export function FilmFacts({ title }: { title: Title }) {
  const details = title.details;
  const fields = [
    [
      title.format === "ep" || title.format === "seas" ? "Série" : "Título original",
      title.original !== title.name ? title.original : "",
    ],
    ["Gêneros", details?.genres.join(", ")],
    ["Duração", details?.runtime ? details.runtime + " min" : ""],
    ["Temporadas", details?.seasons],
    ["Episódios", details?.episodes],
    ...(!details?.people?.length
      ? [
          ["Direção", details?.directors.join(", ")],
          ["Criação", details?.creators.join(", ")],
          ["Elenco", details?.cast.join(", ")],
        ]
      : []),
  ].filter(([, value]) => Boolean(value));
  return (
    <>
      {!!fields.length && (
        <dl className="film-facts">
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {(title.id.startsWith("demo-") || title.id.startsWith("ep-demo-") || title.id.startsWith("season-demo-")) && (
        <p className="muted">
          <small>Obra e pôster ilustrativos.</small>
        </p>
      )}
    </>
  );
}
export function Spoiler({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="review-text">
      {hidden && !open ? (
        <button className="small" onClick={() => setOpen(true)}>
          Revelar spoiler
        </button>
      ) : (
        children
      )}
    </div>
  );
}
