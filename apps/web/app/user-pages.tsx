"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NotificationBell } from "./notification-bell";
import { UiIcon } from "./ui-icons";
import { Poster } from "./title-parts";
import { CardTitle } from "./card-title";
import { api } from "../lib/client-api";
import type { Title } from "../lib/types";

/** Páginas da área pessoal que aparecem na navegação (topo do app e cabeçalho das páginas avulsas). */
export const userPages = [
  { href: "/feed", label: "Feed", icon: "feed" },
  { href: "/colecoes", label: "Coleções", icon: "list" },
  { href: "/estatisticas", label: "Estatísticas", icon: "chart" },
] as const;

/**
 * Cabeçalho das páginas avulsas (feed, coleções, estatísticas), no mesmo estilo de Amigos e Salas.
 * @param current caminho da página aberta, para marcar o link ativo
 */
export function UserPageHeader({ current }: { current: string }) {
  return (
    <>
      <header className="room-header">
        <Link className="account-brand" href="/">
          Cena Aberta
        </Link>
        <div className="row">
          <NotificationBell />
          <Link className="room-nav-button" href="/?aba=profile">
            Meu perfil
          </Link>
        </div>
      </header>
      <nav className="user-pages-nav" aria-label="Sua área">
        {userPages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="room-nav-button"
            aria-current={current === page.href ? "page" : undefined}
          >
            <UiIcon name={page.icon} />
            {page.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

/**
 * Busca no catálogo (`title-batch`) o nome e o pôster das obras, em lotes de 30, guardando o que já veio.
 * @param ids ids das obras que a tela precisa mostrar
 * @returns mapa id → obra (obras que o catálogo não conhece ficam de fora)
 */
export function useTitles(ids: string[]): Record<string, Title> {
  const [known, setKnown] = useState<Record<string, Title>>({});
  const requested = useRef(new Set<string>());
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    const missing = key.split(",").filter((id) => id && !requested.current.has(id));
    if (!missing.length) return;
    missing.forEach((id) => requested.current.add(id));
    (async () => {
      for (let i = 0; i < missing.length; i += 30) {
        const group = await api<Title[]>("title-batch?ids=" + encodeURIComponent(missing.slice(i, i + 30).join(",")));
        setKnown((old) => ({ ...old, ...Object.fromEntries(group.map((title) => [title.id, title])) }));
      }
    })().catch(() => {
      // Sem catálogo a tela continua funcionando com o nome genérico; uma nova renderização tenta de novo.
      missing.forEach((id) => requested.current.delete(id));
    });
  }, [key]);
  return known;
}

/** Nome para mostrar quando o catálogo não trouxe a obra. */
export function titleName(id: string, title?: Title, fallback?: string | null): string {
  return title?.name ?? fallback ?? (id.startsWith("demo-") ? id.slice(5).replace(/-/g, " ") : "Obra do catálogo");
}

/**
 * Card de obra com pôster que leva à página da obra.
 * @param id id da obra
 * @param title metadados do catálogo (opcional)
 * @param children conteúdo extra abaixo do card (nota, ações…)
 */
export function TitleCard({
  id,
  title,
  name,
  children,
}: {
  id: string;
  title?: Title;
  name?: string | null;
  children?: ReactNode;
}) {
  const label = titleName(id, title, name);
  return (
    <article className="catalog-card">
      <Link className="card" href={"/obra/" + encodeURIComponent(id)}>
        {title ? (
          <Poster title={title} />
        ) : (
          <div className="poster art-0">
            <span>{label}</span>
          </div>
        )}
        <CardTitle>{label}</CardTitle>
        {title && (
          <small>
            {[title.year, title.anime ? "Anime" : title.format === "movie" ? "Filme" : "Série"]
              .filter(Boolean)
              .join(" · ")}
          </small>
        )}
      </Link>
      {children}
    </article>
  );
}
