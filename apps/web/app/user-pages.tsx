"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MainHeader } from "./main-header";
import { Poster } from "./title-parts";
import { CardTitle } from "./card-title";
import { api } from "../lib/client-api";
import type { Title } from "../lib/types";

/**
 * Cabeçalho das páginas avulsas (feed, coleções, estatísticas): o mesmo cabeçalho principal da home, para quem entra
 * aqui não perder a navegação. Renderize antes do `<main>`.
 * @param current caminho da página aberta, para marcar o link ativo
 */
export function UserPageHeader({ current }: { current: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<{ name: string; avatar?: string } | null>(null);
  useEffect(() => {
    let active = true;
    api<{ profile?: { name: string; avatar?: string } }>("me?summary=true")
      .then((me) => {
        if (active && me.profile) setProfile(me.profile);
      })
      .catch(() => {
        // Sem o avatar o botão mostra o ícone padrão; a navegação continua funcionando.
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <MainHeader
      authenticated
      tab=""
      activePage={current}
      profile={profile}
      onCategory={(id) => router.push("/?aba=" + id)}
      onProfile={() => router.push("/?aba=profile")}
    />
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
