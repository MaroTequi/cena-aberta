"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/client-api";
import { filterOptions, libraryParams, sortOptions, type LibrarySection } from "../lib/library-query";
import type { Title } from "../lib/types";

type Result<T> = {
  key: string;
  dashboard: unknown;
  items: T[];
  pages: number;
  titles: Map<string, Title>;
};

/**
 * Lista paginada de uma seção da biblioteca no perfil (Vou ver ou Já vistos), com ordenação e filtro.
 * @param section seção da biblioteca
 * @param username perfil visitado (omitido no próprio perfil)
 * @param dashboard dados do perfil; quando mudam (após uma alteração), a lista recarrega
 * @param diaryVisible se a ordenação por sessão recente vale (dono ou diário público)
 * @param render desenha cada item com os metadados do catálogo
 */
export function LibraryPage<T extends { title: string }>({
  section,
  username,
  dashboard,
  diaryVisible,
  render,
}: {
  section: LibrarySection;
  username?: string;
  dashboard: unknown;
  diaryVisible: boolean;
  render: (item: T, title?: Title) => ReactNode;
}) {
  const [page, setPage] = useState(1),
    [sort, setSort] = useState("title"),
    [filter, setFilter] = useState("all"),
    [attempt, retry] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const [error, setError] = useState("");
  const strip = useRef<HTMLDivElement>(null);
  const params = libraryParams({ section, page, username, sort, filter, diaryVisible });
  const key = params.toString();
  useEffect(() => {
    let active = true;
    (async () => {
      const { items, pages } = await api<{ items: T[]; pages: number }>("library-page?" + key);
      if (!active) return;
      if (!items.length && page > 1) {
        setPage(page - 1);
        return;
      }
      const titles = items.length
        ? await api<Title[]>("title-batch?ids=" + encodeURIComponent(items.map((i) => i.title).join(",")))
        : [];
      if (active) {
        setError("");
        setResult({ key, dashboard, items, pages, titles: new Map(titles.map((t) => [t.id, t])) });
      }
    })().catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [key, page, dashboard, attempt]);
  useEffect(() => {
    if (strip.current) strip.current.scrollLeft = 0;
  }, [page]);
  const filtered = sort !== "title" || filter !== "all";
  const label = section === "watched" ? "Já vistos" : "Vou ver";
  const toolbar = (
    <div className="library-filters" role="group" aria-label={"Ordenar e filtrar " + label}>
      <label>
        Ordenar
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
        >
          {sortOptions(section, diaryVisible).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Mostrar
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          {filterOptions(section).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  if (error)
    return (
      <>
        {toolbar}
        <p role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              retry((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      </>
    );
  if (!result || result.key !== key || result.dashboard !== dashboard)
    return (
      <>
        {toolbar}
        <p role="status">Carregando obras…</p>
      </>
    );
  return (
    <>
      {toolbar}
      <div ref={strip} className="grid profile-card-strip">
        {result.items.map((item) => render(item, result.titles.get(item.title)))}
      </div>
      {!result.items.length && (
        <p className="muted">
          {filtered
            ? "Nenhuma obra com esse filtro."
            : section === "watchlist"
              ? "Nenhuma obra salva."
              : "Nenhuma avaliação ou obra vista."}
        </p>
      )}
      {result.pages > 1 && (
        <nav className="row pagination" aria-label={"Páginas de " + label}>
          <button disabled={page === 1} onClick={() => setPage(1)} aria-label="Primeira página">
            «
          </button>
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span aria-live="polite">
            {page} de {result.pages}
          </span>
          <button disabled={page === result.pages} onClick={() => setPage(page + 1)}>
            Próxima
          </button>
          <button disabled={page === result.pages} onClick={() => setPage(result.pages)} aria-label="Última página">
            »
          </button>
        </nav>
      )}
    </>
  );
}
