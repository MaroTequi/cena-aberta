"use client";
import { useEffect, useState } from "react";
import type { Release } from "../lib/releases";
import { UiIcon } from "./ui-icons";
export function LandingPreview({ releases }: { releases: Release[] }) {
  const [step, setStep] = useState(0),
    [paused, setPaused] = useState(false),
    [reduced, setReduced] = useState(true),
    [failed, setFailed] = useState<string[]>([]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (paused || reduced) return;
    const timer = setInterval(() => {
      if (!document.hidden) setStep((s) => s + 1);
    }, 1900);
    return () => clearInterval(timer);
  }, [paused, reduced]);
  const round = Math.floor(step / 6),
    phase = step % 6,
    index = round % Math.max(releases.length, 1),
    film = releases[index];
  const choices = [
    [true, true, true],
    [false, false, false],
    [true, false, true],
  ][round % 3];
  const votes = Math.min(phase, 3),
    likes = choices.slice(0, votes).filter(Boolean).length;
  const complete = phase >= 4,
    match = complete && likes === 3,
    lastVote = votes > 0 ? choices[votes - 1] : null;
  const outcome = match ? "Veremos!" : likes === 0 ? "Ninguém quis ver" : "A turma ficou dividida";
  const caption = match
    ? "Um filme que todo mundo quer ver."
    : likes === 0
      ? "Todo mundo passou. Vamos ao próximo!"
      : "Nem todos querem ver. Vamos buscar outra opção.";
  return (
    <div className="landing-preview animated-preview" aria-label="Demonstração de escolha de filme">
      <div className="preview-top">
        <div className="landing-preview-heading">
          <UiIcon name="card" />
          <strong>Sélete</strong>
        </div>
        <button
          type="button"
          className="preview-pause"
          aria-label={paused ? "Reproduzir demonstração" : "Pausar demonstração"}
          title={paused ? "Reproduzir demonstração" : "Pausar demonstração"}
          disabled={reduced}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "▷" : "Ⅱ"}
        </button>
      </div>
      <div className="landing-poster-stack preview-real-stack">
        <div className="landing-poster-back" />
        <div className="landing-poster-middle" />
        <div
          key={round}
          className={
            "landing-poster-front preview-film " +
            (lastVote === true ? "preview-liked" : lastVote === false ? "preview-pass" : "")
          }
        >
          {film?.poster && !failed.includes(film.id) ? (
            <img
              src={film.poster}
              alt={"Pôster de " + film.name}
              onError={() => setFailed((old) => [...old, film.id])}
            />
          ) : (
            <div className="preview-art">
              <span>HOJE TEM</span>
              <strong>{film?.name ?? "uma boa história."}</strong>
            </div>
          )}
          {film && (
            <div className="preview-film-caption">
              <small>{film.year}</small>
              <strong>{film.name}</strong>
            </div>
          )}
          {votes > 0 && (
            <span className={"preview-stamp " + (lastVote === false ? "pass" : "")}>
              {lastVote ? "QUERO VER" : "PASSO"}
            </span>
          )}
        </div>
      </div>
      <div className="preview-voters" aria-hidden="true">
        {["A", "B", "C"].map((person, i) => (
          <span
            key={person}
            className={votes >= i + 1 ? (choices[i] ? "voted" : "passed") : ""}
            title={person + ": " + (votes >= i + 1 ? (choices[i] ? "Quero ver" : "Passo") : "Aguardando")}
          >
            {votes >= i + 1 ? (choices[i] ? "✓" : "×") : person}
          </span>
        ))}
        <small>{votes ? likes + " de 3 querem ver" : "Cada pessoa dá seu voto"}</small>
      </div>
      <div className={"landing-match " + (match ? "preview-match-active" : complete ? "preview-no-match" : "")}>
        <span className="landing-match-icon" aria-hidden="true">
          <UiIcon name={match ? "heart" : complete ? "next" : "swipe"} />
        </span>
        <div>
          <strong>{complete ? outcome : "Quero ver ou passo?"}</strong>
          <small>{complete ? caption : "Deslize. Encontrem uma escolha em comum."}</small>
        </div>
      </div>
      {film && (
        <a className="preview-credit" href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
          Dados e imagens: TMDB
        </a>
      )}
    </div>
  );
}
