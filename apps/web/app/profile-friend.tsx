"use client";
import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icons";
type Friendship = { id: string | null; relationship: "none" | "incoming" | "outgoing" | "friends" };
async function request(path: string, method = "GET", body?: unknown): Promise<Friendship> {
  const response = await fetch("/api/v1/friends" + path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.message || "Não foi possível consultar a amizade.");
  return data;
}
export function ProfileFriend({ username }: { username: string }) {
  const [friend, setFriend] = useState<Friendship | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const load = () => request("/status?username=" + encodeURIComponent(username));
  useEffect(() => {
    let active = true;
    load()
      .then((value) => {
        if (active) setFriend(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [username]);
  async function act(action?: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      if (action) await request("/" + friend?.id, "PUT", { action });
      else await request("", "POST", { username });
      setFriend(await load());
    } catch (e) {
      setError((e as Error).message);
      try {
        setFriend(await load());
      } catch {}
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="profile-friend" aria-label="Amizade">
      <div className="row">
        {!friend && !error && <span role="status">Carregando amizade…</span>}
        {friend?.relationship === "none" && (
          <button className="primary" disabled={busy} onClick={() => void act()}>
            <UiIcon name="friends" />
            Adicionar amigo
          </button>
        )}
        {friend?.relationship === "outgoing" && (
          <>
            <span className="friend-badge" role="status">
              Pedido enviado
            </span>
            <button disabled={busy} onClick={() => void act("cancel")}>
              Cancelar pedido
            </button>
          </>
        )}
        {friend?.relationship === "incoming" && (
          <>
            <span>Pedido recebido</span>
            <button className="primary" disabled={busy} onClick={() => void act("accept")}>
              Aceitar amizade
            </button>
            <button disabled={busy} onClick={() => void act("decline")}>
              Recusar
            </button>
          </>
        )}
        {friend?.relationship === "friends" && (
          <>
            <span className="friend-badge" role="status">
              Amigos
            </span>
            <a href="/amigos">Gerenciar amizade</a>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}{" "}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              load()
                .then(setFriend)
                .catch((e) => setError(e.message));
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
    </div>
  );
}
