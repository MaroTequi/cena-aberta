"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../../lib/client-api";
import { addTitle, moveTitle, removeTitle } from "../../../lib/collection-items";
import type { Title } from "../../../lib/types";
import { CatalogSearch } from "../../catalog-search";
import { ProfileAvatar } from "../../profile-form";
import { Poster } from "../../title-parts";
import { UiIcon } from "../../ui-icons";
import { TitleCard, UserPageHeader, titleName, useTitles } from "../../user-pages";

type Detail = {
  id: string;
  name: string;
  description: string;
  version: number;
  items: { title: string; position: number }[];
  owner?: { username: string; name: string; avatar?: string };
};
type Loaded = { detail: Detail; own: boolean };
const maxItems = 100;
const conflictMessage =
  "Esta coleção mudou em outra aba ou aparelho. Carregamos a versão mais recente; refaça a alteração.";

/** Abre a coleção como dona (editável) ou, se não for sua, a versão pública de leitura. */
async function loadCollection(id: string): Promise<Loaded> {
  try {
    return { detail: await api<Detail>("me/collections/" + id), own: true };
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
  }
  try {
    return { detail: await api<Detail>("collections/" + id), own: false };
  } catch (e) {
    if (e instanceof ApiError && e.status === 403)
      throw new Error("A dona ou o dono desta coleção deixou as listas privadas.");
    if (e instanceof ApiError && e.status === 404) throw new Error("Coleção não encontrada.");
    throw e;
  }
}

/**
 * Página `/colecoes/[id]`: quem é dono edita nome, descrição e obras (adicionar, remover, reordenar);
 * as demais pessoas veem a coleção sem edição.
 * @param id UUID da coleção
 */
export function CollectionPage({ id }: { id: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, retry] = useState(0);
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Title[] | null>(null);
  const detail = loaded?.detail;
  const titles = (detail ? [...detail.items] : []).sort((a, b) => a.position - b.position).map((item) => item.title);
  const known = useTitles([...titles, ...(results ?? []).map((t) => t.id)]);
  useEffect(() => {
    let active = true;
    loadCollection(id)
      .then((value) => {
        if (active) setLoaded(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);
  /** Executa uma alteração; em conflito de versão (409) recarrega a coleção e avisa. */
  async function change(work: () => Promise<Detail>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await work();
      setLoaded({ detail: next, own: true });
      setNotice(message);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setLoaded(await loadCollection(id));
          setError(conflictMessage);
        } catch (reload) {
          setError((reload as Error).message);
        }
      } else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveItems(next: string[], message: string) {
    if (!detail) return;
    void change(
      () => api<Detail>("me/collections/" + id + "/items", "PUT", { version: detail.version, titles: next }),
      message,
    );
  }
  function add(title: string) {
    if (titles.includes(title)) {
      setNotice("Essa obra já está na coleção.");
      return;
    }
    if (titles.length >= maxItems) {
      setError("Use até 100 obras.");
      return;
    }
    saveItems(addTitle(titles, title), "Obra adicionada.");
  }
  function saveInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const form = new FormData(event.currentTarget);
    void change(
      () =>
        api<Detail>("me/collections/" + id, "PUT", {
          name: String(form.get("name") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
          version: detail.version,
        }),
      "Coleção salva.",
    );
  }
  async function removeCollection() {
    if (!detail || busy || !window.confirm("Excluir a coleção “" + detail.name + "”?")) return;
    setBusy(true);
    setError("");
    try {
      await api("me/collections/" + id, "DELETE");
      router.push("/colecoes");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function search() {
    const term = query.trim();
    if (term.length < 2) return;
    setError("");
    try {
      const params = new URLSearchParams({ type: "all", query: term, page: "1" });
      setResults((await api<{ items: Title[] }>("titles?" + params)).items);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const own = !!loaded?.own;
  return (
    <main className="wrap friends-page collection-page">
      <UserPageHeader current={own ? "/colecoes" : ""} />
      {own && (
        <p>
          <Link href="/colecoes">← Minhas coleções</Link>
        </p>
      )}
      {!loaded && !error && <p role="status">Carregando coleção…</p>}
      {error && (
        <p role="alert" className="message error">
          {error}{" "}
          {!loaded && (
            <button
              onClick={() => {
                setError("");
                retry((n) => n + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="message">
          {notice}
        </p>
      )}
      {detail && (
        <>
          <div className="room-intro">
            <span className="room-eyebrow">COLEÇÃO · {titles.length === 1 ? "1 OBRA" : titles.length + " OBRAS"}</span>
            <h1>{detail.name}</h1>
            {detail.description && <p className="review-text">{detail.description}</p>}
            {!own && detail.owner && (
              <Link className="friend-person" href={"/?usuario=" + encodeURIComponent(detail.owner.username)}>
                <ProfileAvatar name={detail.owner.name} avatar={detail.owner.avatar} />
                <span>
                  <strong>{detail.owner.name}</strong>
                  <small>@{detail.owner.username}</small>
                </span>
              </Link>
            )}
          </div>
          {own && (
            <details className="panel">
              <summary>Editar nome e descrição</summary>
              <form className="form" key={detail.version} onSubmit={saveInfo}>
                <label>
                  Nome
                  <input name="name" required maxLength={100} defaultValue={detail.name} />
                </label>
                <label>
                  Descrição (opcional)
                  <textarea name="description" maxLength={500} defaultValue={detail.description} />
                </label>
                <div className="row">
                  <button className="primary" disabled={busy}>
                    Salvar
                  </button>
                  <button
                    type="button"
                    className="collection-danger"
                    disabled={busy}
                    onClick={() => void removeCollection()}
                  >
                    Excluir coleção
                  </button>
                </div>
              </form>
            </details>
          )}
          {own && (
            <section className="panel collection-add" aria-labelledby="collection-add-heading">
              <h2 id="collection-add-heading">Adicionar obras</h2>
              <CatalogSearch
                category="all"
                query={query}
                onChange={(value) => {
                  setQuery(value);
                  if (!value) setResults(null);
                }}
                onSearch={() => void search()}
                onOpen={add}
              />
              {results && (
                <div className="collection-results">
                  {!results.length && <p className="muted">Nenhuma obra encontrada.</p>}
                  {results.map((title) => (
                    <div className="collection-row" key={title.id}>
                      <div className="collection-thumb">
                        <Poster title={title} />
                      </div>
                      <span className="collection-row-name">
                        <strong>{title.name}</strong>
                        <small>
                          {[title.year, title.anime ? "Anime" : title.format === "movie" ? "Filme" : "Série"]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </span>
                      <button type="button" disabled={busy || titles.includes(title.id)} onClick={() => add(title.id)}>
                        {titles.includes(title.id) ? "Na coleção" : "Adicionar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          <section className="panel" aria-labelledby="collection-items-heading" aria-busy={busy}>
            <h2 id="collection-items-heading">Obras</h2>
            {!titles.length && (
              <p className="muted">
                {own
                  ? "Coleção vazia. Busque acima ou use “Adicionar à coleção” na página de uma obra."
                  : "Coleção vazia."}
              </p>
            )}
            {own ? (
              <ol className="collection-items">
                {titles.map((title, index) => {
                  const name = titleName(title, known[title]);
                  return (
                    <li className="collection-row" key={title}>
                      <span className="collection-position" aria-hidden="true">
                        {index + 1}
                      </span>
                      <Link className="collection-thumb" href={"/obra/" + encodeURIComponent(title)} tabIndex={-1}>
                        {known[title] ? <Poster title={known[title]} /> : <div className="poster art-0" />}
                      </Link>
                      <span className="collection-row-name">
                        <Link href={"/obra/" + encodeURIComponent(title)}>
                          <strong>{name}</strong>
                        </Link>
                        {known[title] && <small>{known[title].year}</small>}
                      </span>
                      <span className="collection-row-actions">
                        <button
                          type="button"
                          disabled={busy || index === 0}
                          aria-label={"Subir " + name}
                          title="Subir"
                          onClick={() => saveItems(moveTitle(titles, index, -1), "Ordem salva.")}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={busy || index === titles.length - 1}
                          aria-label={"Descer " + name}
                          title="Descer"
                          onClick={() => saveItems(moveTitle(titles, index, 1), "Ordem salva.")}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={"Remover " + name + " da coleção"}
                          title="Remover da coleção"
                          onClick={() => saveItems(removeTitle(titles, title), "Obra removida.")}
                        >
                          <UiIcon name="trash" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="grid">
                {titles.map((title) => (
                  <TitleCard key={title} id={title} title={known[title]} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
