"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/client-api";
import {
  MIN_SEARCH,
  cleanTerm,
  departmentLabel,
  searchHref,
  searchTabs,
  titleTypeOf,
  type SearchTab,
} from "../../lib/search";
import type { Title } from "../../lib/types";
import { workKind } from "../../lib/work-links";
import { CardTitle } from "../card-title";
import { Poster } from "../poster";
import { Portrait } from "../work-people";

type PersonResult = { id: number; name: string; photo: string | null; department: string; knownFor: string[] };
type Page<T> = { items: T[]; hasMore: boolean; approximate?: boolean };
type Results = {
  titles: Title[];
  titlesMore: boolean;
  people: PersonResult[];
  peopleMore: boolean;
  page: number;
  approximate: boolean;
};

/** Quantas pessoas a aba "Tudo" mostra antes de "Ver todas as pessoas"; as obras aparecem todas, com "Carregar mais". */
const PREVIEW_PEOPLE = 6;

/**
 * Busca central: um campo só para filmes, séries, animes e pessoas, com abas por tipo.
 * O termo e a aba ficam na URL, então a busca pode ser compartilhada e volta com o histórico.
 * @param initialQuery termo vindo da URL
 * @param initialTab aba vinda da URL
 */
export function CentralSearch({ initialQuery, initialTab }: { initialQuery: string; initialTab: SearchTab }) {
  const [query, setQuery] = useState(initialQuery),
    [tab, setTab] = useState<SearchTab>(initialTab),
    [term, setTerm] = useState(cleanTerm(initialQuery)),
    [results, setResults] = useState<Results | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);

  // Espera a pessoa parar de digitar antes de buscar.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(cleanTerm(query)), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    window.history.replaceState(null, "", searchHref(term, tab));
  }, [term, tab]);

  useEffect(() => {
    if (term.length < MIN_SEARCH) return;
    let active = true;
    const type = titleTypeOf[tab];
    const encoded = encodeURIComponent(term);
    const titles =
      type === null
        ? Promise.resolve<Page<Title>>({ items: [], hasMore: false })
        : api<Page<Title>>("titles?type=" + type + "&query=" + encoded + "&page=1");
    const people =
      tab === "tudo" || tab === "pessoas"
        ? api<Page<PersonResult>>("people?query=" + encoded + "&page=1")
        : Promise.resolve<Page<PersonResult>>({ items: [], hasMore: false });
    Promise.all([titles, people])
      .then(([foundTitles, foundPeople]) => {
        if (!active) return;
        setResults({
          titles: foundTitles.items,
          titlesMore: foundTitles.hasMore,
          people: foundPeople.items,
          peopleMore: foundPeople.hasMore,
          page: 1,
          approximate: !!foundTitles.approximate || !!foundPeople.approximate,
        });
        setError("");
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [term, tab, attempt]);

  async function loadMore() {
    if (!results) return;
    const next = results.page + 1;
    const encoded = encodeURIComponent(term);
    setLoading(true);
    try {
      if (tab === "pessoas") {
        const found = await api<Page<PersonResult>>("people?query=" + encoded + "&page=" + next);
        setResults({ ...results, people: [...results.people, ...found.items], peopleMore: found.hasMore, page: next });
      } else {
        const found = await api<Page<Title>>("titles?type=" + titleTypeOf[tab] + "&query=" + encoded + "&page=" + next);
        const seen = new Set(results.titles.map((title) => title.id));
        const fresh = found.items.filter((title) => !seen.has(title.id));
        setResults({ ...results, titles: [...results.titles, ...fresh], titlesMore: found.hasMore, page: next });
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function choose(next: SearchTab) {
    if (next === tab) return;
    setResults(null);
    if (term.length >= MIN_SEARCH) setLoading(true);
    setTab(next);
  }

  const ready = term.length >= MIN_SEARCH;
  const current = ready ? results : null;
  const overview = tab === "tudo";
  const titles = current ? current.titles : [];
  const people = current ? (overview ? current.people.slice(0, PREVIEW_PEOPLE) : current.people) : [];
  const empty = !!current && !loading && !titles.length && !people.length;
  const more = current && (tab === "pessoas" ? current.peopleMore : current.titlesMore);

  return (
    <main className="wrap central-search">
      <h1>Buscar</h1>
      <form
        className="central-search-field"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(cleanTerm(query));
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          autoFocus
          maxLength={100}
          value={query}
          aria-label="Buscar filmes, séries, animes e pessoas"
          placeholder="Filmes, séries, animes ou pessoas…"
          onChange={(event) => {
            setQuery(event.target.value);
            if (cleanTerm(event.target.value).length >= MIN_SEARCH) setLoading(true);
          }}
        />
      </form>
      <nav className="central-search-tabs" aria-label="Tipo de resultado">
        {searchTabs.map((option) => (
          <button key={option.id} type="button" aria-pressed={tab === option.id} onClick={() => choose(option.id)}>
            {option.label}
          </button>
        ))}
      </nav>
      {!ready && (
        <p className="muted central-search-hint">
          Digite pelo menos {MIN_SEARCH} letras para buscar por nome de obra, ator, diretora ou roteirista.
        </p>
      )}
      {ready && error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              setLoading(true);
              retry((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {ready && loading && !current && <p role="status">Buscando…</p>}
      {empty && <p className="muted">Nada encontrado para “{term}”.</p>}
      {current?.approximate && !empty && (
        <p className="central-search-approximate" role="status">
          Não achamos “{term}” exatamente. Mostrando nomes parecidos.
        </p>
      )}
      {!!people.length && (
        <section aria-labelledby="search-people">
          <header className="central-search-heading">
            <h2 id="search-people">Pessoas</h2>
            {overview && current && current.people.length > PREVIEW_PEOPLE && (
              <button type="button" onClick={() => choose("pessoas")}>
                Ver todas as pessoas
              </button>
            )}
          </header>
          <ul className="central-search-people">
            {people.map((person) => (
              <li key={person.id}>
                <a href={"/pessoa/" + person.id}>
                  <Portrait name={person.name} photo={person.photo} />
                  <span>
                    <strong>{person.name}</strong>
                    <small>
                      {[departmentLabel(person.department), person.knownFor.join(", ")].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!!titles.length && (
        <section aria-labelledby="search-titles">
          <header className="central-search-heading">
            <h2 id="search-titles">{overview ? "Obras" : searchTabs.find((option) => option.id === tab)?.label}</h2>
          </header>
          <div className="grid">
            {titles.map((title) => (
              <article className="catalog-card" key={title.id}>
                <a className="card" href={"/obra/" + title.id}>
                  <Poster title={title} />
                  <CardTitle>{title.name}</CardTitle>
                  <small>{[title.year, workKind(title)].filter(Boolean).join(" · ")}</small>
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
      {more && (
        <div className="row central-search-more">
          <button type="button" disabled={loading} onClick={() => void loadMore()}>
            {loading ? "Carregando…" : "Carregar mais"}
          </button>
        </div>
      )}
    </main>
  );
}
