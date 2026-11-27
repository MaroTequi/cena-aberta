"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/client-api";
import { relativeTime } from "../../lib/social-format";
import { ProfileAvatar } from "../profile-form";

type Recommendation = {
  id: string;
  sender: { username: string; name: string; avatar?: string };
  title: string;
  titleName: string;
  message: string | null;
  created: string;
  seen: boolean;
};
type Inbox = { items: Recommendation[]; unseen: number; hasMore: boolean };

/** Avisa o sino para recarregar depois de marcar uma recomendação como lida. */
function notifyBell() {
  window.dispatchEvent(new Event("room-notifications-changed"));
}

/** Recomendações recebidas de amigos, com a mensagem e a opção de marcar como lida. */
export function Recommendations() {
  const [items, setItems] = useState<Recommendation[]>([]),
    [unseen, setUnseen] = useState(0),
    [hasMore, setHasMore] = useState(false),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Inbox>("recommendations")
      .then((inbox) => {
        if (!active) return;
        setItems(inbox.items);
        setUnseen(inbox.unseen);
        setHasMore(inbox.hasMore);
        setLoaded(true);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function more() {
    setBusy(true);
    setError("");
    try {
      const inbox = await api<Inbox>("recommendations?offset=" + items.length);
      setItems((old) => [...old, ...inbox.items]);
      setUnseen(inbox.unseen);
      setHasMore(inbox.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function read(item: Recommendation) {
    if (item.seen) return;
    try {
      await api("recommendations/" + item.id + "/read", "PUT");
      setItems((old) => old.map((r) => (r.id === item.id ? { ...r, seen: true } : r)));
      setUnseen((n) => Math.max(0, n - 1));
      notifyBell();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loaded && !items.length && !error) return null;
  return (
    <section className="panel" aria-labelledby="recommendations-heading">
      <h2 id="recommendations-heading">
        Recomendações para você{" "}
        {unseen > 0 && <span className="friend-count">{unseen > 99 ? "99+" : unseen} novas</span>}
      </h2>
      {!loaded && !error && <p role="status">Carregando recomendações…</p>}
      <ul className="recommendation-list">
        {items.map((item) => (
          <li key={item.id} className={item.seen ? "recommendation" : "recommendation recommendation-new"}>
            <ProfileAvatar name={item.sender.name} avatar={item.sender.avatar} />
            <div>
              <p>
                <Link href={"/?usuario=" + encodeURIComponent(item.sender.username)}>
                  <strong>{item.sender.name}</strong>
                </Link>{" "}
                recomendou{" "}
                <Link href={"/obra/" + encodeURIComponent(item.title)} onClick={() => void read(item)}>
                  <strong>{item.titleName}</strong>
                </Link>
              </p>
              {item.message && <blockquote className="review-text">{item.message}</blockquote>}
              <small>
                <time dateTime={item.created}>{relativeTime(item.created)}</time>
              </small>
            </div>
            {!item.seen && (
              <button type="button" className="small" onClick={() => void read(item)}>
                Marcar como lida
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {hasMore && (
        <button disabled={busy} onClick={() => void more()}>
          Ver mais recomendações
        </button>
      )}
    </section>
  );
}
