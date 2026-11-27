"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/client-api";
import { MIN_SEARCH, cleanTerm, departmentLabel, searchHref } from "../lib/search";
import type { Title } from "../lib/types";
import { workKind } from "../lib/work-links";

type PersonResult = { id: number; name: string; photo: string | null; department: string; knownFor: string[] };
type Option = { href: string; name: string; detail: string; image: string | null; kind: "title" | "person" };

/** Quantas obras e pessoas a lista suspensa mostra. */
const MAX_TITLES = 6,
  MAX_PEOPLE = 4;

/**
 * Busca da barra superior, ao lado da logo: ao digitar, abre uma lista suspensa com obras (filmes, séries
 * e animes) e pessoas, sem sair da página. Escolher um item abre a obra ou a pessoa; Enter sem item
 * escolhido (ou a lupa) abre a página com todos os resultados.
 * Teclado: setas navegam, Enter abre, Esc fecha.
 */
export function HeaderSearch() {
  const router = useRouter();
  const listId = useId();
  const root = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [result, setResult] = useState<{
      term: string;
      titles: Option[];
      people: Option[];
      failed: boolean;
      approximate: boolean;
    } | null>(null);
  const term = cleanTerm(query);
  const ready = term.length >= MIN_SEARCH;
  const current = ready && result?.term === term ? result : null;
  const options = current ? [...current.titles, ...current.people] : [];

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setTimeout(() => {
      const encoded = encodeURIComponent(term);
      Promise.allSettled([
        api<{ items: Title[]; approximate?: boolean }>("titles?type=all&query=" + encoded + "&page=1"),
        api<{ items: PersonResult[]; approximate?: boolean }>("people?query=" + encoded + "&page=1"),
      ]).then(([titles, people]) => {
        if (!active) return;
        setResult({
          term,
          failed: titles.status === "rejected" && people.status === "rejected",
          approximate:
            (titles.status === "fulfilled" && !!titles.value.approximate) ||
            (people.status === "fulfilled" && !!people.value.approximate),
          titles:
            titles.status === "fulfilled"
              ? titles.value.items.slice(0, MAX_TITLES).map((title) => ({
                  href: "/obra/" + title.id,
                  name: title.name,
                  detail: [workKind(title), title.year].filter(Boolean).join(" · "),
                  image: title.poster,
                  kind: "title" as const,
                }))
              : [],
          people:
            people.status === "fulfilled"
              ? people.value.items.slice(0, MAX_PEOPLE).map((person) => ({
                  href: "/pessoa/" + person.id,
                  name: person.name,
                  detail: [departmentLabel(person.department), person.knownFor.slice(0, 2).join(", ")]
                    .filter(Boolean)
                    .join(" · "),
                  image: person.photo,
                  kind: "person" as const,
                }))
              : [],
        });
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [term, ready]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setActive(-1);
    router.push(href);
  }

  const showPanel = open && ready;
  function row(option: Option, index: number) {
    return (
      <li
        key={option.href}
        id={listId + "-" + index}
        role="option"
        aria-selected={active === index}
        className="header-search-option"
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActive(index)}
        onClick={() => go(option.href)}
      >
        {option.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={"header-search-thumb " + option.kind} src={option.image} alt="" loading="lazy" />
        ) : (
          <span className={"header-search-thumb header-search-initial " + option.kind} aria-hidden="true">
            {Array.from(option.name)[0]}
          </span>
        )}
        <span>
          <strong>{option.name}</strong>
          {option.detail && <small>{option.detail}</small>}
        </span>
      </li>
    );
  }

  return (
    <form
      ref={root}
      className="header-search"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = showPanel ? options[active] : undefined;
        if (chosen) go(chosen.href);
        else if (ready) go(searchHref(term, "tudo"));
      }}
    >
      <button
        type="submit"
        className="header-search-submit"
        aria-label="Ver todos os resultados"
        title="Ver todos os resultados"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      <input
        type="search"
        role="combobox"
        aria-label="Buscar filmes, séries, animes e pessoas"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-activedescendant={showPanel && options[active] ? listId + "-" + active : undefined}
        autoComplete="off"
        placeholder="Buscar filmes, séries, pessoas…"
        maxLength={100}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            if (open) setOpen(false);
            else setQuery("");
          }
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length) {
            event.preventDefault();
            setOpen(true);
            setActive((i) =>
              event.key === "ArrowDown" ? (i + 1) % options.length : i <= 0 ? options.length - 1 : i - 1,
            );
          }
        }}
      />
      <div
        className="header-search-panel"
        id={listId}
        role="listbox"
        aria-label="Resultados da busca"
        hidden={!showPanel}
      >
        {!current && <p className="header-search-status">Buscando…</p>}
        {current?.failed && <p className="header-search-status">Não foi possível buscar agora. Tente de novo.</p>}
        {current && !current.failed && !options.length && (
          <p className="header-search-status">Nada encontrado para “{term}”.</p>
        )}
        {current?.approximate && !!options.length && (
          <p className="header-search-status">Não achamos “{term}” exatamente. Veja nomes parecidos:</p>
        )}
        {!!current?.titles.length && (
          <ul role="group" aria-label="Obras">
            <li role="presentation" className="header-search-group">
              Obras
            </li>
            {current.titles.map((option, index) => row(option, index))}
          </ul>
        )}
        {!!current?.people.length && (
          <ul role="group" aria-label="Pessoas">
            <li role="presentation" className="header-search-group">
              Pessoas
            </li>
            {current.people.map((option, index) => row(option, current.titles.length + index))}
          </ul>
        )}
        {!!options.length && (
          <a
            className="header-search-all"
            href={searchHref(term, "tudo")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              go(searchHref(term, "tudo"));
            }}
          >
            Ver todos os resultados para “{term}”
          </a>
        )}
      </div>
    </form>
  );
}
