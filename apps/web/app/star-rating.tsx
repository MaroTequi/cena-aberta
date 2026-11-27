"use client";
import { readPreference, writePreference, subscribePreferences } from "../lib/browser-preferences";
import { useId, useState, useSyncExternalStore } from "react";

const preferenceKey = "cenaaberta.rating-control";
type RatingMode = "stars" | "list";
function readMode(): RatingMode {
  return readPreference(preferenceKey) === "list" ? "list" : "stars";
}
function changeMode(mode: RatingMode) {
  writePreference(preferenceKey, mode);
}

export function RatingPreference() {
  const mode = useSyncExternalStore(subscribePreferences, readMode, () => "stars");
  return (
    <div className="rating-preference">
      <label>
        Formato de avaliação
        <select value={mode} onChange={(event) => changeMode(event.target.value as RatingMode)}>
          <option value="stars">Estrelas</option>
          <option value="list">Nota numérica</option>
        </select>
      </label>
      <div className="rating-example">
        <small>Exemplo</small>
        <output aria-live="polite" aria-label="Exemplo de avaliação">
          {mode === "stars" ? (
            <>
              <span aria-hidden="true">★★★★☆</span>
              <span className="sr-only">4 de 5 estrelas</span>
            </>
          ) : (
            "4 / 5"
          )}
        </output>
      </div>
    </div>
  );
}

export function StarRating({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  const name = useId();
  const mode = useSyncExternalStore(subscribePreferences, readMode, () => "stars");
  const [preview, setPreview] = useState<number | null>(null);
  const active = preview ?? value ?? 0;
  return (
    <fieldset className="star-rating" disabled={disabled}>
      <legend>Minha nota</legend>
      <div className="rating-row">
        <button
          type="button"
          className="rating-clear rating-icon"
          title="Limpar nota"
          aria-label="Limpar nota"
          disabled={disabled || value === null}
          onClick={() => {
            setPreview(null);
            onChange(null);
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m14 3 7 7-11 11H6l-4-4L14 3Zm-7 9 7 7m-4 2h12" />
          </svg>
        </button>

        {mode === "stars" ? (
          <>
            <div className="rating-stars" onMouseLeave={() => setPreview(null)}>
              {Array.from({ length: 5 }, (_, index) => {
                const fill = Math.max(0, Math.min(2, active - index * 2)) * 50;
                return (
                  <span className="rating-star" key={index}>
                    <span
                      className="star-shape"
                      aria-hidden="true"
                      style={{ background: `linear-gradient(90deg, var(--accent) ${fill}%, #798398 ${fill}%)` }}
                    />
                    {[1, 2].map((half) => {
                      const score = index * 2 + half;
                      return (
                        <label
                          key={half}
                          className={"star-target star-half-" + half}
                          onMouseEnter={() => setPreview(score)}
                        >
                          <input
                            type="radio"
                            name={name}
                            value={score}
                            checked={value === score}
                            onChange={() => {
                              setPreview(null);
                              onChange(score);
                            }}
                            onFocus={() => setPreview(score)}
                            onBlur={() => setPreview(null)}
                            aria-label={(score / 2).toLocaleString("pt-BR") + " de 5 estrelas"}
                          />
                        </label>
                      );
                    })}
                  </span>
                );
              })}
            </div>
            <span className="rating-value" aria-live="polite">
              {active ? (active / 2).toLocaleString("pt-BR") + " / 5" : ""}
            </span>
          </>
        ) : (
          <select
            className="rating-note-select"
            aria-label="Minha nota"
            value={value ?? ""}
            onChange={(event) => {
              setPreview(null);
              onChange(event.target.value ? Number(event.target.value) : null);
            }}
          >
            <option value="" aria-label="Nenhuma nota">
              —
            </option>
            {Array.from({ length: 10 }, (_, index) => (
              <option key={index} value={index + 1}>
                {((index + 1) / 2).toLocaleString("pt-BR")} estrelas
              </option>
            ))}
          </select>
        )}
      </div>
    </fieldset>
  );
}
