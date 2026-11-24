"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/client-api";
import { toStars } from "../../lib/stats";
import { ProfileAvatar } from "../profile-form";
import { Spoiler } from "../title-parts";

type FriendEntry = {
  username: string;
  name: string;
  avatar?: string;
  watched: boolean;
  interest: boolean;
  rating: number | null;
  review: string | null;
  spoiler: boolean;
};

/**
 * Seção "Amigos que viram" da página da obra (só o que cada amigo deixa visível).
 * @param titleId id da obra
 * @param watched se quem está vendo já assistiu (libera spoilers, como na comunidade)
 */
export function TitleFriends({ titleId, watched }: { titleId: string; watched: boolean }) {
  const [items, setItems] = useState<FriendEntry[] | null>(null),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ items: FriendEntry[] }>("titles/" + titleId + "/friends")
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [titleId, attempt]);
  return (
    <section className="community title-friends" aria-labelledby="title-friends-heading">
      <h3 id="title-friends-heading">Amigos que viram</h3>
      {!items && !error && <p role="status">Carregando amigos…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              retry((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {items && !items.length && <p className="muted">Nenhum amigo registrou esta obra ainda.</p>}
      {items?.map((friend) => (
        <article className="record" key={friend.username}>
          <div className="row review-author">
            <Link className="review-author-link" href={"/?usuario=" + encodeURIComponent(friend.username)}>
              <ProfileAvatar name={friend.name} avatar={friend.avatar} />
              {friend.name}
            </Link>
            {friend.watched && <span className="friend-badge">Já viu</span>}
            {friend.interest && <span className="friend-badge">Quer ver</span>}
            {friend.rating !== null && <span className="review-score">★ {toStars(friend.rating)}</span>}
          </div>
          {friend.review && <Spoiler hidden={!watched && friend.spoiler}>{friend.review}</Spoiler>}
        </article>
      ))}
    </section>
  );
}
