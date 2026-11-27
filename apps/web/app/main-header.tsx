"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { EditorialLinks } from "./editorial-links";
import { HeaderSearch } from "./header-search";
import { NotificationBell } from "./notification-bell";
import { CatalogDrawer } from "./catalog-drawer";
import { ProfileAvatar } from "./profile-form";
import { UiIcon } from "./ui-icons";

/** Categorias do catálogo na navegação principal: [id, nome]. */
export const categories = [
  ["all", "Explorar"],
  ["movie", "Filmes"],
  ["tv", "Séries"],
  ["anime", "Animes"],
];

/** Páginas da área pessoal que aparecem na navegação principal (topo do app e das páginas avulsas). */
export const userPages = [
  { href: "/feed", label: "Mural", icon: "feed" },
  { href: "/colecoes", label: "Coleções", icon: "list" },
  { href: "/estatisticas", label: "Estatísticas", icon: "chart" },
] as const;

/**
 * Cabeçalho principal do app (logo, busca, catálogo, Resenhas, Recomendações, Notícias, Sélete, sino e menu da conta com as páginas pessoais e Sair), o mesmo na home
 * e nas páginas avulsas (feed, coleções, estatísticas) para a navegação não mudar de uma tela para outra.
 * @param authenticated se há sessão (sem sessão mostra Entrar/Criar conta)
 * @param emailAccounts se o login por e-mail está habilitado
 * @param tab categoria do catálogo em destaque ("" quando a tela não é do catálogo)
 * @param activePage caminho da página pessoal aberta (ex.: "/feed"), para destacar o link
 * @param profile nome e avatar do usuário para o botão de perfil (null enquanto carrega)
 * @param profileActive se o botão de perfil representa a tela atual
 * @param onCategory chamado ao escolher uma categoria (ou a logo, que volta ao Explorar)
 * @param onProfile chamado ao clicar em Meu perfil
 */
export function MainHeader({
  authenticated,
  emailAccounts = false,
  tab,
  activePage = "",
  profile,
  profileActive = false,
  onCategory,
  onProfile,
}: {
  authenticated: boolean;
  emailAccounts?: boolean;
  tab: string;
  activePage?: string;
  profile?: { name: string; avatar?: string } | null;
  profileActive?: boolean;
  onCategory: (id: string) => void;
  onProfile: () => void;
}) {
  return (
    <header className="top">
      <div className="wrap nav">
        {authenticated && (
          <CatalogDrawer
            categories={categories.map(([id, name]) => [id, id === "all" ? "Explorar" : name])}
            current={tab}
            currentLink={activePage}
            onSelect={onCategory}
            links={userPages}
          />
        )}
        <button className="logo" onClick={() => onCategory("all")}>
          <span className="mark">◈</span> cena<span>aberta</span>
        </button>
        {authenticated && <HeaderSearch />}
        <nav aria-label="Navegação principal">
          {authenticated &&
            categories.map(([id, name]) => (
              <button
                key={id}
                className={(tab === id ? "nav-active " : "") + "catalog-desktop-category"}
                onClick={() => onCategory(id)}
              >
                {name}
              </button>
            ))}
          <Link className="room-nav-link" href="/resenhas" aria-current={tab === "reviews" ? "page" : undefined}>
            Resenhas
          </Link>
          <EditorialLinks onRecommendationsPage={tab === "recommendations"} onNewsPage={tab === "news"} />
          {authenticated && (
            <a className="room-nav-link" href="/salas" aria-current={tab === "rooms" ? "page" : undefined}>
              Sélete
            </a>
          )}
        </nav>
        <div className={authenticated ? "account account-signed-in" : "account"}>
          {authenticated ? (
            <>
              <NotificationBell />
              <AccountMenu
                profile={profile}
                active={profileActive || userPages.some((link) => link.href === activePage)}
                activePage={activePage}
                onProfile={onProfile}
              />
            </>
          ) : emailAccounts ? (
            <>
              <a className="account-link nav-login" href="/conta">
                Entrar
              </a>
              <a className="account-link primary" href="/conta?modo=register">
                Criar conta
              </a>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/**
 * Menu da conta, aberto pelo avatar: Meu perfil, páginas pessoais, Configurações e Sair.
 * Fecha com Esc (devolvendo o foco ao botão), com clique fora e ao escolher um item.
 * @param profile nome e avatar (null enquanto carrega)
 * @param active se a tela atual é o perfil ou uma página pessoal
 * @param activePage caminho da página pessoal aberta, para marcar o item
 * @param onProfile chamado ao escolher Meu perfil
 */
function AccountMenu({
  profile,
  active,
  activePage,
  onProfile,
}: {
  profile?: { name: string; avatar?: string } | null;
  active: boolean;
  activePage: string;
  onProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="account-menu-trigger"
        aria-label="Menu da conta"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {profile ? (
          <ProfileAvatar name={profile.name} avatar={profile.avatar} />
        ) : (
          <span className="profile-avatar profile-initial" aria-hidden="true">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
            </svg>
          </span>
        )}
        <svg
          className="account-menu-chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id="account-menu-panel" className="account-menu-panel" hidden={!open}>
        {profile && <p className="account-menu-name">{profile.name}</p>}
        <button
          type="button"
          className="account-menu-item"
          onClick={() => {
            setOpen(false);
            onProfile();
          }}
        >
          <UiIcon name="user" />
          Meu perfil
        </button>
        {userPages.map((link) => (
          <a
            key={link.href}
            className="account-menu-item"
            href={link.href}
            aria-current={activePage === link.href ? "page" : undefined}
          >
            <UiIcon name={link.icon} />
            {link.label}
          </a>
        ))}
        <a className="account-menu-item" href="/conta/configuracoes">
          <UiIcon name="settings" />
          Configurações
        </a>
        <hr />
        <button
          type="button"
          className="account-menu-item account-menu-signout"
          onClick={() => signOut({ callbackUrl: "/" })}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m3-12 4 4-4 4m-5-4h9" />
          </svg>
          Sair
        </button>
      </div>
    </div>
  );
}
