"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../lib/client-api";
import { ProfileAvatar } from "../profile-form";
import { UiIcon } from "../ui-icons";

type Friend = { username: string; name: string; avatar?: string };
type Sent = { recipient: Friend; duplicate: boolean };

/** Formulário do diálogo: escolher um amigo e escrever uma mensagem opcional. */
function RecommendForm({ titleId, name, username }: { titleId: string; name: string; username: string }) {
  const [friends, setFriends] = useState<Friend[] | null>(null),
    [more, setMore] = useState(false),
    [recipient, setRecipient] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function page(offset: number) {
    const data = await api<{ items: Friend[]; hasMore: boolean }>(
      "friends/profile?username=" + encodeURIComponent(username) + "&offset=" + offset,
    );
    setFriends((old) => (offset ? [...(old ?? []), ...data.items] : data.items));
    setMore(data.hasMore);
  }
  useEffect(() => {
    let active = true;
    api<{ items: Friend[]; hasMore: boolean }>("friends/profile?username=" + encodeURIComponent(username) + "&offset=0")
      .then((data) => {
        if (!active) return;
        setFriends(data.items);
        setMore(data.hasMore);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [username]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!recipient || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const sent = await api<Sent>("recommendations", "POST", {
        recipient,
        title: titleId,
        message: message.trim() || null,
      });
      setNotice(
        sent.duplicate
          ? "Você já tinha recomendado " +
              name +
              " para " +
              sent.recipient.name +
              ". A recomendação anterior continua valendo."
          : "Recomendação enviada para " + sent.recipient.name + ".",
      );
      setMessage("");
    } catch (e) {
      // 429 (limite diário), 403 (não é amigo) e demais erros chegam com a mensagem pronta do backend.
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (friends && !friends.length)
    return (
      <p className="muted">
        Você ainda não tem amigos para recomendar. <Link href="/amigos">Encontre sua turma</Link>.
      </p>
    );
  return (
    <form className="form recommend-form" onSubmit={send}>
      {!friends && !error && <p role="status">Carregando amigos…</p>}
      {friends && (
        <fieldset className="picker-list recommend-friends">
          <legend>Para quem?</legend>
          {friends.map((friend) => (
            <label key={friend.username} className="recommend-friend">
              <input
                type="radio"
                name="recipient"
                value={friend.username}
                checked={recipient === friend.username}
                onChange={() => setRecipient(friend.username)}
              />
              <ProfileAvatar name={friend.name} avatar={friend.avatar} />
              <span>
                <strong>{friend.name}</strong>
                <small>@{friend.username}</small>
              </span>
            </label>
          ))}
          {more && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void page(friends.length).catch((e) => setError(e.message))}
            >
              Ver mais amigos
            </button>
          )}
        </fieldset>
      )}
      <label>
        Mensagem (opcional)
        <textarea
          value={message}
          maxLength={300}
          placeholder="Por que essa pessoa vai gostar?"
          onChange={(e) => setMessage(e.target.value)}
        />
        <small>{message.length}/300</small>
      </label>
      <div className="row">
        <button className="primary" disabled={busy || !recipient}>
          {busy ? "Enviando…" : "Recomendar"}
        </button>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="message">
          {notice}
        </p>
      )}
    </form>
  );
}

/**
 * Botão "Recomendar a um amigo" da página da obra.
 * @param titleId id da obra
 * @param name nome da obra
 * @param username username de quem está logado (para listar os amigos)
 */
export function RecommendTitle({ titleId, name, username }: { titleId: string; name: string; username: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <UiIcon name="send" /> Recomendar a um amigo
      </button>
      <dialog
        ref={dialog}
        className="session-dialog picker-dialog"
        aria-labelledby="recommend-heading"
        onClose={() => setOpen(false)}
      >
        <header className="section-heading">
          <h2 id="recommend-heading">Recomendar {name}</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        {open && <RecommendForm titleId={titleId} name={name} username={username} />}
      </dialog>
    </>
  );
}
