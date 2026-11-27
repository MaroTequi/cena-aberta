"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RoomFriends } from "./room-friends";
import { UiIcon } from "../ui-icons";
import { useRouter } from "next/navigation";
import { ProfileAvatar } from "../profile-form";

type Film = { id: string; name: string; year: string; summary: string; poster: string | null };
const genres: Record<number, string> = {
  0: "Todos os gêneros",
  28: "Ação",
  12: "Aventura",
  16: "Animação",
  35: "Comédia",
  80: "Crime",
  99: "Documentário",
  18: "Drama",
  10751: "Família",
  14: "Fantasia",
  36: "História",
  27: "Terror",
  10402: "Música",
  9648: "Mistério",
  10749: "Romance",
  878: "Ficção científica",
  10770: "Cinema TV",
  53: "Suspense",
  10752: "Guerra",
  37: "Faroeste",
};
const mediaTypes = { all: "Todos", movie: "Filmes", tv: "Séries", anime: "Animes" };
type Room = {
  type: keyof typeof mediaTypes;
  reconsiderations?: {
    title: string;
    supporters: { isSelf?: boolean; username: string; name: string; avatar?: string }[];
  }[];
  genres?: number[];
  subscribedOnly?: boolean;
  providerCount?: number;
  genre: number;
  id: string;
  name: string;
  status: string;
  isOwner: boolean;
  chosen: string | null;
  members: { isSelf?: boolean; username: string; name: string; avatar: string; voted: number }[];
  titles: Film[];
  votes: { title: string; liked: boolean }[];
  matches: string[];
};
type Summary = { invited?: boolean; isOwner: boolean; id: string; name: string; status: string };
async function api<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch("/api/v1/rooms" + path, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.message ?? "Não foi possível atualizar a sala."), { status: r.status });
  return data;
}
function RoomNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="room-nav-button" href={href}>
      <span className="room-nav-symbol">
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="15" rx="3" />
          <path d="M3 9h18M8 4l3 5m3-5 3 5m-7 4 4 2-4 2z" />
        </svg>
      </span>
      <span>{children}</span>
    </a>
  );
}
export function MovieRoom({ id, profile }: { id?: string; profile: { name: string; avatar?: string } }) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null),
    [rooms, setRooms] = useState<Summary[]>([]),
    [join, setJoin] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState("Sessão com amigos"),
    [invite, setInvite] = useState("");
  const [ended, setEnded] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const gesture = useRef<{ x: number; y: number } | null>(null),
    pending = useRef(false);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let terminal = false;
    function stop() {
      clearTimeout(timer);
      request?.abort();
    }
    async function sync(afterAction = false) {
      stop();
      if (document.hidden || terminal) return;
      const current = new AbortController();
      request = current;
      try {
        if (pending.current && !afterAction) return;
        if (id) {
          const data = await api<Room>("/" + id, "GET", undefined, current.signal);
          if (!current.signal.aborted) {
            setRoom(data);
            setJoin(false);
          }
        } else {
          const data = await api<Summary[]>("", "GET", undefined, current.signal);
          if (!current.signal.aborted) setRooms(data);
        }
      } catch (e) {
        if (current.signal.aborted) return;
        if (id && (e as { status?: number }).status === 403) {
          setJoin(true);
          setRoom(null);
        } else if (id && [404, 410].includes((e as { status?: number }).status ?? 0)) {
          terminal = true;
          setRoom(null);
          setJoin(false);
          setError("");
          setEnded((e as Error).message);
          window.dispatchEvent(new Event("room-notifications-changed"));
        } else setError((e as Error).message);
      } finally {
        if (!current.signal.aborted && !document.hidden && !terminal) timer = setTimeout(() => void sync(), 4000);
      }
    }
    const onVisibility = () => {
      if (document.hidden) stop();
      else void sync();
    };
    refresh.current = () => sync(true);
    setRoom(null);
    setJoin(false);
    setEnded("");
    document.addEventListener("visibilitychange", onVisibility);
    void sync();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
      refresh.current = async () => {};
    };
  }, [id, revision]);
  async function action(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh.current();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const selectedGenres = room?.genres ?? (room?.genre ? [room.genre] : []);
  const voted = new Set(room?.votes.map((v) => v.title));
  const film = room?.titles.find((t) => !voted.has(t.id));
  const matches = room?.titles.filter((t) => room.matches.includes(t.id)) ?? [];
  const done = room?.members.every((m) => Number(m.voted) >= room.titles.length);
  async function vote(liked: boolean) {
    if (!film || busy) return;
    setOffset(0);
    await action(() => api("/" + id + "/votes/" + film.id, "PUT", { liked }));
  }
  function deleteButton(roomId: string, roomName: string) {
    return (
      <button
        className="room-delete"
        type="button"
        disabled={busy}
        aria-label={"Excluir sala " + roomName}
        title="Excluir sala"
        onClick={async () => {
          if (
            !confirm(
              "Excluir a sala “" + roomName + "”? Os votos e matches serão apagados para todos os participantes.",
            )
          )
            return;
          setBusy(true);
          setError("");
          try {
            await api("/" + roomId, "DELETE");
            window.dispatchEvent(new Event("room-notifications-changed"));
            if (id) router.push("/salas");
            else await refresh.current();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <UiIcon name="trash" />
      </button>
    );
  }
  function leaveButton(roomId: string, roomName: string, status: string) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (
            pending.current ||
            !confirm(
              "Sair de “" +
                roomName +
                "”?" +
                (status === "voting" ? " Se restar apenas uma pessoa na votação, a sala será desfeita." : ""),
            )
          )
            return;
          pending.current = true;
          setBusy(true);
          setError("");
          try {
            const result = await api<{ dissolved: boolean }>("/" + roomId + "/leave", "POST");
            setNotice(result.dissolved ? "Você saiu e a sala foi desfeita." : "Você saiu da sala.");
            window.dispatchEvent(new Event("room-notifications-changed"));
            if (id) router.replace("/salas");
            else await refresh.current();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        Sair da sala
      </button>
    );
  }
  function openInvite() {
    try {
      const u = new URL(invite, location.origin);
      const code = u.searchParams.get("sala") ?? invite.trim();
      if (!/^[a-f0-9-]{36}$/.test(code)) throw new Error();
      router.push("/salas?sala=" + code);
      setRevision((n) => n + 1);
    } catch {
      setError("Cole o link ou o código completo da sala.");
    }
  }
  async function copyInvite(input: HTMLInputElement) {
    input.select();
    setCopyNotice("");
    try {
      await navigator.clipboard.writeText(input.value);
      setCopyNotice("Link copiado para a área de transferência.");
    } catch {
      setCopyNotice("Não foi possível copiar automaticamente. O link está selecionado para copiar manualmente.");
    }
  }
  async function share() {
    const url = location.origin + "/salas?sala=" + id;
    try {
      if (navigator.share) await navigator.share({ title: "Vamos escolher um filme?", url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copiado.");
      }
    } catch {
      setNotice("Copie o link abaixo para convidar.");
    }
  }
  return (
    <main className="wrap rooms-page">
      <div className="room-intro">
        <span className="room-eyebrow">UMA ESCOLHA, TODO MUNDO JUNTO</span>
        <h1>
          {room?.name ?? (
            <span className="selete-title">
              <UiIcon name="card" />
              Sélete
            </span>
          )}
        </h1>
        <p>
          O <strong className="profile-section-name">Vou ver</strong> de cada pessoa entra na seleção da rodada.
          Deslize, descubra os matches e combinem a sessão.
        </p>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}{" "}
          <button
            className="small"
            onClick={() => {
              setError("");
              setRevision((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="message">
          {notice}
        </p>
      )}
      {!id && (
        <div className="room-home">
          <section className="panel">
            <h2>Crie sua sala</h2>
            <p>
              De 2 a 8 pessoas. Os filmes do <strong className="profile-section-name">Vou ver</strong> serão
              compartilhados com o grupo ao começar.
            </p>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const r = await api<{ id: string }>("", "POST", { name });
                  router.push("/salas?sala=" + r.id);
                });
              }}
            >
              <label>
                Nome da sala
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
              </label>
              <button className="primary" disabled={busy}>
                Criar sala
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Recebeu um convite?</h2>
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                openInvite();
              }}
            >
              <label>
                Link ou código
                <input value={invite} onChange={(e) => setInvite(e.target.value)} required />
              </label>
              <button disabled={busy}>Entrar na sala</button>
            </form>
          </section>
          <section className="panel room-recent">
            <h2>Suas salas</h2>
            {rooms.length ? (
              rooms.map((r) => (
                <div className="room-list-row" key={r.id}>
                  <a className="room-list-item" href={"/salas?sala=" + r.id}>
                    <strong>{r.name}</strong>
                    <span>
                      {r.invited
                        ? "Convite recebido · entrar na sala"
                        : r.status === "lobby"
                          ? "Aguardando o grupo"
                          : r.status === "chosen"
                            ? "Filme escolhido"
                            : "Rodada em andamento"}
                    </span>
                  </a>
                  {r.isOwner ? deleteButton(r.id, r.name) : !r.invited && leaveButton(r.id, r.name, r.status)}
                </div>
              ))
            ) : (
              <p>Você ainda não tem salas. Elas ficam disponíveis por 7 dias.</p>
            )}
          </section>
        </div>
      )}
      {id && ended && (
        <section className="panel">
          <p role="status">{ended}</p>
          <RoomNavLink href="/salas">Minhas salas</RoomNavLink>
        </section>
      )}
      {id && join && (
        <section className="panel room-join">
          <h2>Você foi convidado</h2>
          <p>
            Ao entrar, as obras do seu <strong className="profile-section-name">Vou ver</strong> poderão fazer parte da
            rodada e ficar visíveis aos participantes. Quando houver maioria, quem passou poderá ver os nomes de quem
            quer ver para reconsiderar.
          </p>
          <div className="room-join-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void action(() => api("/" + id + "/join", "POST"))}
            >
              Entrar e participar
            </button>
            <RoomNavLink href="/salas">Minhas salas</RoomNavLink>
          </div>
        </section>
      )}
      {id && !room && !join && !error && !ended && <p role="status">Carregando sala…</p>}
      {room && (
        <>
          <section className="panel room-people" aria-label="Participantes">
            <div className="section-heading">
              <h2>{room.members.length}/8 participantes</h2>
              <div className="room-header-actions">
                <RoomNavLink href="/salas">Minhas salas</RoomNavLink>
                {room.isOwner ? deleteButton(room.id, room.name) : leaveButton(room.id, room.name, room.status)}
              </div>
            </div>
            <div className="room-members">
              {room.members.map((m, index) => (
                <a
                  className="room-member-link"
                  key={index}
                  href={m.isSelf || !m.username ? undefined : "/?usuario=" + encodeURIComponent(m.username)}
                  aria-label={m.isSelf ? "Seu perfil" : "Ver perfil de " + m.name}
                >
                  <ProfileAvatar name={m.name} avatar={m.avatar} />
                  <span>
                    {m.name}
                    <small>{room.status === "lobby" ? "Na sala" : m.voted + "/" + room.titles.length + " votos"}</small>
                  </span>
                </a>
              ))}
            </div>
          </section>
          {room.status === "lobby" && (
            <section className="panel room-lobby">
              <h2>Reúna todo mundo</h2>
              <RoomFriends key={room.id + room.members.length} roomId={room.id} full={room.members.length >= 8} />
              <fieldset className="room-genre-filter">
                <legend>Tipo de obra</legend>
                <div className="room-genre-options">
                  {Object.entries(mediaTypes).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={room.type === value}
                      disabled={busy || !room.isOwner}
                      onClick={() => void action(() => api("/" + id + "/settings", "PUT", { type: value }))}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="room-genre-filter">
                <legend>Qual é o clima da sessão?</legend>
                <div className="room-genre-options">
                  {Object.entries(genres).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={
                        Number(value) === 0 ? selectedGenres.length === 0 : selectedGenres.includes(Number(value))
                      }
                      disabled={busy || !room.isOwner}
                      onClick={() =>
                        void action(() =>
                          api("/" + id + "/settings", "PUT", {
                            genres:
                              Number(value) === 0
                                ? []
                                : selectedGenres.includes(Number(value))
                                  ? selectedGenres.filter((g) => g !== Number(value))
                                  : [...selectedGenres, Number(value)],
                          }),
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <small>
                  Obras de qualquer gênero selecionado, no <strong className="profile-section-name">Vou ver</strong> e
                  nas sugestões.{" "}
                  {room.isOwner ? "Escolha um ou mais antes de iniciar." : "O anfitrião escolhe os gêneros."}
                </small>
              </fieldset>
              <fieldset className="room-genre-filter">
                <legend>Onde vamos assistir?</legend>
                <div className="room-genre-options">
                  {[
                    [false, "Qualquer lugar"],
                    [true, "Só o que a gente assina"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={String(value)}
                      aria-pressed={!!room.subscribedOnly === value}
                      disabled={!room.isOwner}
                      aria-disabled={busy || undefined}
                      onClick={() => {
                        if (!busy) void action(() => api("/" + id + "/settings", "PUT", { subscribedOnly: value }));
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {room.subscribedOnly && !room.providerCount ? (
                  <small className="room-filter-warning">
                    Ninguém da sala marcou streamings ainda. Marquem em{" "}
                    <Link href="/conta/configuracoes#streamings">Configurações</Link> ou a rodada não começa.
                  </small>
                ) : (
                  <small>
                    {room.subscribedOnly
                      ? "Só entram obras incluídas em " +
                        (room.providerCount === 1 ? "1 serviço" : room.providerCount + " serviços") +
                        " que alguém da sala assina."
                      : room.isOwner
                        ? "Ligue o filtro para ver só obras incluídas em um serviço que alguém da sala assina."
                        : "O anfitrião pode limitar a rodada ao que a sala assina."}
                  </small>
                )}
              </fieldset>
              <p>
                Começamos pelas obras do <strong className="profile-section-name">Vou ver</strong>. Se as listas
                estiverem vazias, usamos sugestões do TMDB. Misturamos as listas sem repetir obras, em uma rodada de até
                60 títulos. Depois do início, ninguém mais entra. Se a maioria quiser ver, quem passou poderá
                reconsiderar vendo os nomes de quem quer ver.
              </p>
              <button onClick={() => void share()}>Convidar pessoas</button>
              <label>
                Link da sala
                <input
                  readOnly
                  value={typeof window !== "undefined" ? location.origin + "/salas?sala=" + id : ""}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => void copyInvite(e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void copyInvite(e.currentTarget);
                    }
                  }}
                  aria-describedby="room-copy-status"
                />
              </label>
              <p id="room-copy-status" className="room-copy-status" role="status">
                {copyNotice || "Clique no link para copiar e compartilhar."}
              </p>
              {room.isOwner ? (
                <button
                  className="primary"
                  disabled={busy || room.members.length < 2}
                  onClick={() => void action(() => api("/" + id + "/start", "POST"))}
                >
                  {busy ? "Preparando as obras…" : "Todos chegaram · iniciar rodada"}
                </button>
              ) : (
                <p>Aguardando o anfitrião iniciar.</p>
              )}
              <p className="muted">O convite da sala não substitui o convite de cadastro da alpha.</p>
            </section>
          )}
          {room.status === "voting" && !!room.reconsiderations?.length && (
            <section className="panel room-reconsider" aria-label="Segunda rodada">
              <span className="room-eyebrow">A MAIORIA QUER VER</span>
              <h2>Que tal reconsiderar?</h2>
              {room.reconsiderations.map((proposal) => {
                const title = room.titles.find((t) => t.id === proposal.title);
                return (
                  <article className="room-reconsider-film" key={proposal.title}>
                    {title?.poster && (
                      <img className="reconsider-poster" src={title.poster} alt={"Pôster de " + title.name} />
                    )}
                    <div>
                      <h3>{title?.name ?? "Filme da rodada"}</h3>
                      <p>
                        {proposal.supporters.length} de {room.members.length} integrantes querem ver:
                      </p>
                      <div className="room-members">
                        {proposal.supporters.map((person, index) => (
                          <a
                            className="room-member-link"
                            key={index}
                            href={
                              person.isSelf || !person.username
                                ? undefined
                                : "/?usuario=" + encodeURIComponent(person.username)
                            }
                            aria-label={person.isSelf ? "Seu perfil" : "Ver perfil de " + person.name}
                          >
                            <ProfileAvatar name={person.name} avatar={person.avatar} />
                            <span>
                              {person.name}
                              {person.username && <small>@{person.username}</small>}
                            </span>
                          </a>
                        ))}
                      </div>
                      <div className="row">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(() => api("/" + id + "/reconsider/" + proposal.title, "PUT", { liked: false }))
                          }
                        >
                          Continuo passando
                        </button>
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() =>
                            void action(() => api("/" + id + "/reconsider/" + proposal.title, "PUT", { liked: true }))
                          }
                        >
                          Também quero ver
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          {room.status === "voting" && (
            <div className="room-play">
              <section className="room-swipe-area">
                <div className="room-progress">
                  <span>
                    {selectedGenres.length ? selectedGenres.map((g) => genres[g]).join(" · ") : "Todos os gêneros"} ·
                    {room.subscribedOnly ? " Só o que a gente assina ·" : ""} Seu voto · {room.votes.length}/
                    {room.titles.length}
                  </span>
                  <progress value={room.votes.length} max={room.titles.length} />
                </div>
                {film ? (
                  <>
                    <article
                      className="room-swipe-card"
                      style={{ transform: `translateX(${offset}px) rotate(${offset / 18}deg)` }}
                      onPointerDown={(e) => {
                        if (busy || e.button !== 0) return;
                        gesture.current = { x: e.clientX, y: e.clientY };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (gesture.current && !busy)
                          setOffset(Math.max(-110, Math.min(110, e.clientX - gesture.current.x)));
                      }}
                      onPointerUp={(e) => {
                        const g = gesture.current;
                        gesture.current = null;
                        setOffset(0);
                        if (
                          g &&
                          !busy &&
                          Math.abs(e.clientX - g.x) > 70 &&
                          Math.abs(e.clientX - g.x) > Math.abs(e.clientY - g.y) * 1.3
                        )
                          void vote(e.clientX > g.x);
                      }}
                      onPointerCancel={() => {
                        gesture.current = null;
                        setOffset(0);
                      }}
                    >
                      {film.poster ? (
                        <img src={film.poster} alt={"Pôster de " + film.name} draggable={false} />
                      ) : (
                        <div className="room-no-poster">{film.name}</div>
                      )}
                      <div className="room-card-caption">
                        <span>{film.year}</span>
                        <h2>{film.name}</h2>
                      </div>
                      {Math.abs(offset) > 30 && (
                        <span className={"room-stamp " + (offset > 0 ? "yes" : "no")}>
                          {offset > 0 ? "QUERO VER" : "PASSO"}
                        </span>
                      )}
                    </article>
                    <p className="room-summary">{film.summary || "Sinopse indisponível."}</p>
                    <div className="room-vote-actions">
                      <button disabled={busy} className="room-pass" onClick={() => void vote(false)}>
                        <span aria-hidden="true">×</span>Passar
                      </button>
                      <button disabled={busy} className="room-like" onClick={() => void vote(true)}>
                        <span aria-hidden="true">♥</span>Quero ver
                      </button>
                    </div>
                    <p className="muted room-hint">Esquerda para passar · direita para curtir</p>
                  </>
                ) : (
                  <section className="panel">
                    <h2>{done ? "Rodada concluída" : "Você terminou!"}</h2>
                    <p>
                      {done
                        ? matches.length
                          ? "Escolham um dos matches ao lado."
                          : "Nenhum filme teve unanimidade ainda. Continuem com sugestões do TMDB."
                        : "Aguarde os votos do grupo. Os matches aparecem automaticamente."}
                    </p>
                    {done &&
                      (room.isOwner ? (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void action(() => api("/" + id + "/more", "POST"))}
                        >
                          {busy ? "Buscando filmes…" : "Continuar com sugestões"}
                        </button>
                      ) : (
                        <p>O anfitrião pode adicionar mais sugestões.</p>
                      ))}
                  </section>
                )}
              </section>
              <section className="panel room-matches">
                <h2>
                  Veremos! <span>{matches.length}</span>
                </h2>
                <p>Filmes que todos querem ver.</p>
                {!matches.length && <p className="muted">O primeiro match pode estar no próximo swipe.</p>}
                {matches.map((t) => (
                  <article className="room-match" key={t.id}>
                    {t.poster && <img src={t.poster} alt="" />}
                    <div>
                      <h3>{t.name}</h3>
                      <span>{t.year}</span>
                      {room.isOwner ? (
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={() => void action(() => api("/" + id + "/choose/" + t.id, "POST"))}
                        >
                          Vamos ver este
                        </button>
                      ) : (
                        <p>Aguardando a escolha do anfitrião.</p>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            </div>
          )}
          {room.status === "chosen" && (
            <section className="panel room-chosen">
              <span className="room-eyebrow">SESSÃO DECIDIDA</span>
              <h2>Todo mundo topou!</h2>
              {room.titles
                .filter((t) => t.id === room.chosen)
                .map((t) => (
                  <div key={t.id}>
                    {t.poster && <img src={t.poster} alt={"Pôster de " + t.name} />}
                    <h3>{t.name}</h3>
                    <p>{t.year}</p>
                    <a className="primary" href={"/obra/" + t.id}>
                      Ver detalhes do filme
                    </a>
                  </div>
                ))}
              <aside className="room-library-note" aria-label="Sua biblioteca">
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 11v6M12 7h.01" />
                </svg>
                <div>
                  <strong>Sua biblioteca continua igual</strong>
                  <p>
                    O filme permanece no <strong className="profile-section-name">Vou ver</strong>, se estiver lá.
                    Depois de assistir, marque <strong className="profile-section-name">Já vi</strong> na página do
                    filme.
                  </p>
                </div>
              </aside>
              <RoomNavLink href="/salas">Minhas salas</RoomNavLink>
            </section>
          )}
        </>
      )}
    </main>
  );
}
