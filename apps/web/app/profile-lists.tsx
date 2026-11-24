"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/client-api";
import { CollectionCard, type CollectionSummary } from "./colecoes/collection-cover";
import { useTitles } from "./user-pages";

/**
 * Seção "Listas" do perfil: coleções do dono (ou de quem é visitado, se ele deixou as listas públicas).
 * @param username perfil visitado; `undefined` mostra as coleções de quem está logado
 * @param visibility controle de visibilidade da seção (só para o dono)
 */
export function ProfileLists({ username, visibility }: { username?: string; visibility: ReactNode }) {
  const [items, setItems] = useState<CollectionSummary[] | null>(null),
    [hidden, setHidden] = useState(false),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  const known = useTitles((items ?? []).flatMap((c) => c.titles.slice(0, 4)));
  useEffect(() => {
    let active = true;
    api<{ items: CollectionSummary[] }>(
      username ? "collections?username=" + encodeURIComponent(username) : "me/collections",
    )
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((e) => {
        if (!active) return;
        // 403 = o dono deixou as listas privadas; a seção some como as outras seções ocultas.
        if (e instanceof ApiError && e.status === 403) setHidden(true);
        else setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [username, attempt]);
  if (hidden) return null;
  return (
    <section className="panel" aria-labelledby="profile-lists-heading">
      <div className="section-heading">
        <h2 id="profile-lists-heading">Listas</h2>
        <div className="row">
          {!username && (
            <Link className="small" href="/colecoes">
              Gerenciar coleções
            </Link>
          )}
          {visibility}
        </div>
      </div>
      {!items && !error && <p role="status">Carregando listas…</p>}
      {error && (
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
      )}
      {items && !items.length && (
        <p className="muted">
          {username ? "Nenhuma lista por aqui ainda." : "Você ainda não criou coleções."}{" "}
          {!username && <Link href="/colecoes">Criar uma coleção</Link>}
        </p>
      )}
      {items && items.length > 0 && (
        <div className="collection-grid">
          {items.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} known={known} />
          ))}
        </div>
      )}
    </section>
  );
}
