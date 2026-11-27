"use client";
import { NotificationBell } from "../notification-bell";
import { useEffect, useState } from "react";
import { UiIcon } from "../ui-icons";
import { ProfileAvatar } from "../profile-form";
type Person = {
  id: string | null;
  username: string;
  name: string;
  avatar?: string | null;
  relationship: "none" | "incoming" | "outgoing" | "friends";
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/v1/friends" + path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "Não foi possível atualizar suas amizades.");
  return data;
}
export function FriendsPanel({ profile }: { profile: { name: string; avatar?: string } }) {
  const [people, setPeople] = useState<Person[]>([]),
    [results, setResults] = useState<Person[]>([]),
    [query, setQuery] = useState(""),
    [searched, setSearched] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load(offset = 0) {
    const data = await api("?offset=" + offset);
    setPeople((old) => (offset ? [...old, ...data.items] : data.items));
    setMore(data.hasMore);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      if (searched) setResults(await api("/search?q=" + encodeURIComponent(searched)));
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function card(p: Person) {
    return (
      <article className="friend-card" key={p.username}>
        <a className="friend-person" href={"/?usuario=" + encodeURIComponent(p.username)}>
          <ProfileAvatar name={p.name} avatar={p.avatar} />
          <span>
            <strong>{p.name}</strong>
            <small>@{p.username}</small>
          </span>
        </a>
        <div className="friend-actions">
          {p.relationship === "none" ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void action(() => api("", "POST", { username: p.username }), "Pedido enviado.")}
            >
              Adicionar amigo
            </button>
          ) : p.relationship === "incoming" ? (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void action(() => api("/" + p.id, "PUT", { action: "accept" }), "Amizade aceita!")}
              >
                Aceitar
              </button>
              <button
                disabled={busy}
                onClick={() => void action(() => api("/" + p.id, "PUT", { action: "decline" }), "Pedido recusado.")}
              >
                Recusar
              </button>
            </>
          ) : p.relationship === "outgoing" ? (
            <>
              <span className="friend-badge">Pedido enviado</span>
              <button
                disabled={busy}
                onClick={() => void action(() => api("/" + p.id, "PUT", { action: "cancel" }), "Pedido cancelado.")}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <span className="friend-badge">Amigos</span>
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Remover " + p.name + " dos seus amigos?"))
                    void action(() => api("/" + p.id, "PUT", { action: "remove" }), "Amizade removida.");
                }}
              >
                Remover
              </button>
            </>
          )}
        </div>
      </article>
    );
  }
  return (
    <main className="wrap friends-page">
      <header className="room-header">
        <a className="account-brand" href="/">
          Cena Aberta
        </a>
        <div className="row">
          <NotificationBell />
          <a className="room-nav-button room-profile-link" href="/?aba=profile">
            <ProfileAvatar name={profile.name} avatar={profile.avatar} />
            Meu perfil
          </a>
        </div>
      </header>
      <nav className="work-back-links" aria-label="Navegação de Amigos">
        <a
          className="room-nav-button"
          href="/?aba=profile"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !document.referrer) return;
            const previous = new URL(document.referrer);
            if (
              previous.origin !== window.location.origin ||
              previous.pathname === window.location.pathname ||
              window.history.length < 2
            )
              return;
            event.preventDefault();
            window.history.back();
          }}
        >
          <UiIcon name="back" />
          Voltar
        </a>
      </nav>
      <div className="room-intro">
        <span className="room-eyebrow">BOAS HISTÓRIAS, BOAS COMPANHIAS</span>
        <h1>Meus amigos</h1>
        <p>Encontre sua turma e acompanhe os perfis de quem divide o amor pelo cinema.</p>
      </div>
      <section className="panel">
        <h2>Encontre pessoas</h2>
        <form
          className="friend-search"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              setResults(await api("/search?q=" + encodeURIComponent(query.trim())));
              setSearched(query.trim());
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nome ou usuário
            <input
              value={query}
              minLength={2}
              maxLength={80}
              required
              placeholder="Quem você quer encontrar?"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy || query.trim().length < 2}>
            Buscar
          </button>
        </form>
        {searched && (
          <div className="friend-results">
            <h3>Resultados para “{searched}”</h3>
            {results.length ? (
              results.map(card)
            ) : (
              <p className="muted">Nenhuma pessoa encontrada. Tente outro nome ou usuário.</p>
            )}
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="message error">
          {error}
          <button disabled={busy} onClick={() => void action(() => load(), "Lista atualizada.")}>
            Tentar novamente
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="message">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando amigos…</p>
      ) : (
        <>
          {(
            [
              ["incoming", "Pedidos recebidos", "Nenhum pedido aguardando sua resposta."],
              ["friends", "Amigos", "Sua turma começa com um convite. Busque alguém acima."],
              ["outgoing", "Pedidos enviados", "Nenhum pedido pendente."],
            ] as const
          ).map(([type, title, empty]) => (
            <section className="panel" key={type}>
              <h2>
                {title}{" "}
                <span className="friend-count">
                  {people.filter((p) => p.relationship === type).length}
                  {more ? "+" : ""}
                </span>
              </h2>
              {people.filter((p) => p.relationship === type).length ? (
                people.filter((p) => p.relationship === type).map(card)
              ) : (
                <p className="muted">{more ? "Nenhum nesta página. Carregue mais para continuar." : empty}</p>
              )}
            </section>
          ))}
          {more && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await load(people.length);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Carregar mais
            </button>
          )}
        </>
      )}
    </main>
  );
}
