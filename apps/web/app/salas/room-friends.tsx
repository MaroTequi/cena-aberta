"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProfileAvatar } from "../profile-form";
type Friend = { username: string; name: string; avatar?: string; joined: boolean; invited: boolean };
export function RoomFriends({ roomId, full }: { roomId: string; full: boolean }) {
  const [friends, setFriends] = useState<Friend[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const load = useCallback(
    async (offset = 0) => {
      const response = await fetch(`/api/v1/rooms/${roomId}/friends?offset=${offset}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || "Não foi possível carregar seus amigos.");
      setFriends((old) => (offset ? [...old, ...data.items] : data.items));
      setMore(data.hasMore);
    },
    [roomId],
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    load()
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  async function invite(friend: Friend) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/v1/rooms/${roomId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: friend.username }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || "Não foi possível enviar o convite.");
      setFriends((old) =>
        old.map((p) => (p.username === friend.username ? { ...p, invited: !data.joined, joined: !!data.joined } : p)),
      );
      setNotice(
        data.joined
          ? "Essa pessoa já está na sala."
          : "Convite enviado para " + friend.name + ". Ele aparece em Minhas salas.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="room-friends" aria-labelledby="room-friends-title">
      <h3 id="room-friends-title">Chame seus amigos</h3>
      <p>
        Escolha quem convidar. Cada pessoa confirma a entrada em{" "}
        <strong className="profile-section-name">Minhas salas</strong>.
      </p>
      {loading ? (
        <p role="status">Carregando amigos…</p>
      ) : (
        <>
          {friends.map((friend) => (
            <div className="room-friend-row" key={friend.username}>
              <a href={"/?usuario=" + encodeURIComponent(friend.username)} className="room-member-link">
                <ProfileAvatar name={friend.name} avatar={friend.avatar} />
                <span>
                  {friend.name}
                  <small>@{friend.username}</small>
                </span>
              </a>
              <button
                type="button"
                className={friend.invited || friend.joined ? "" : "primary"}
                disabled={busy || full || friend.invited || friend.joined}
                onClick={() => void invite(friend)}
                aria-label={(friend.joined ? "Na sala: " : friend.invited ? "Convidado: " : "Convidar ") + friend.name}
              >
                {friend.joined ? "Na sala" : friend.invited ? "Convidado" : "Convidar"}
              </button>
            </div>
          ))}
          {!friends.length && !error && (
            <p>
              Você ainda não tem amigos adicionados. <a href="/amigos">Encontrar amigos</a>
            </p>
          )}
          {more && (
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await load(friends.length);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Mostrar mais amigos
            </button>
          )}
        </>
      )}
      {full && <p role="status">A sala está cheia.</p>}
      {notice && (
        <p role="status" className="message">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="message error">
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              load().catch((e) => setError(e.message));
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
    </section>
  );
}
