"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Title } from "../../lib/types";
import { Poster } from "../title-parts";

/** Resumo de coleção como vem em `GET /me/collections` e `GET /collections?username=`. */
export type CollectionSummary = {
  id: string;
  name: string;
  description: string;
  version: number;
  count: number;
  titles: string[];
};

/**
 * Card de coleção com capa em mosaico (até 4 pôsteres) que leva a `/colecoes/{id}`.
 * @param collection resumo da coleção
 * @param known obras já buscadas no catálogo
 * @param children ações extras (ex.: excluir)
 */
export function CollectionCard({
  collection,
  known,
  children,
}: {
  collection: CollectionSummary;
  known: Record<string, Title>;
  children?: ReactNode;
}) {
  const cover = collection.titles.slice(0, 4);
  return (
    <article className="collection-card">
      <Link className="collection-link" href={"/colecoes/" + collection.id}>
        <div className={"collection-cover collection-cover-" + Math.max(1, cover.length)} aria-hidden="true">
          {cover.length ? (
            cover.map((id) =>
              known[id] ? <Poster key={id} title={known[id]} /> : <div key={id} className="poster art-1" />,
            )
          ) : (
            <div className="poster art-4">
              <span>Vazia</span>
            </div>
          )}
        </div>
        <strong className="collection-name">{collection.name}</strong>
        <small>
          {collection.count === 1 ? "1 obra" : collection.count + " obras"}
          {collection.description ? " · " + collection.description : ""}
        </small>
      </Link>
      {children}
    </article>
  );
}
