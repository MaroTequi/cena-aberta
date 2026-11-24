"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../../lib/client-api";
import { feedAction, relativeTime } from "../../lib/social-format";
import { toStars } from "../../lib/stats";
import { ProfileAvatar } from "../profile-form";
import { Poster, Spoiler } from "../title-parts";
import { UserPageHeader, titleName, useTitles } from "../user-pages";
import { Recommendations } from "./recommendations";

type Person = { username: string; name: string; avatar?: string };
type FeedItem = {
  kind: "watched" | "rated" | "reviewed";
  actor: Person;
  title: string;
  rating: number | null;
  review: string | null;
  spoiler: boolean;
  at: string;
};
type FeedPage = { items: FeedItem[]; next: string | null };

/** Página `/feed`: atividade recente dos amigos, com paginação por cursor, e recomendações recebidas. */
export function FriendsFeed() {
  const [items, setItems] = useState<FeedItem[]>([]),
    [next, setNext] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  const titles = useTitles(items.map((item) => item.title));
  useEffect(() => {
    let active = true;
    api<FeedPage>("feed")
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setNext(page.next);
        setLoaded(true);
        setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function more() {
    if (!next || busy) return;
    setBusy(true);
    setError("");
    try {
      const page = await api<FeedPage>("feed?before=" + encodeURIComponent(next));
      setItems((old) => [...old, ...page.items]);
      setNext(page.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <UserPageHeader current="/feed" />
      <main className="wrap friends-page feed-page">
        <div className="room-intro">
          <span className="room-eyebrow">O QUE A TURMA ANDA VENDO</span>
          <h1>Feed</h1>
          <p>Sessões, notas e resenhas recentes dos seus amigos.</p>
        </div>
        <Recommendations />
        <section className="panel" aria-labelledby="feed-heading" aria-busy={!loaded || busy}>
          <h2 id="feed-heading">Atividade dos amigos</h2>
          {!loaded && !error && <p role="status">Carregando o feed…</p>}
          {loaded && !items.length && (
            <p className="muted">
              Nada por aqui ainda. Quando seus amigos registrarem sessões ou publicarem notas e resenhas, elas aparecem
              aqui. <Link href="/amigos">Encontrar amigos</Link>
            </p>
          )}
          <ol className="feed-list">
            {items.map((item) => {
              const title = titles[item.title];
              const name = titleName(item.title, title);
              return (
                <li className="feed-item" key={item.kind + item.actor.username + item.title + item.at}>
                  <Link className="feed-poster" href={"/obra/" + encodeURIComponent(item.title)} tabIndex={-1}>
                    {title ? <Poster title={title} /> : <div className="poster art-0" aria-hidden="true" />}
                  </Link>
                  <div className="feed-body">
                    <p className="feed-line">
                      <Link className="feed-actor" href={"/?usuario=" + encodeURIComponent(item.actor.username)}>
                        <ProfileAvatar name={item.actor.name} avatar={item.actor.avatar} />
                        <strong>{item.actor.name}</strong>
                      </Link>{" "}
                      {feedAction(item.kind)}{" "}
                      <Link href={"/obra/" + encodeURIComponent(item.title)}>
                        <strong>{name}</strong>
                      </Link>
                    </p>
                    <p className="feed-meta">
                      {item.rating !== null && (
                        <span className="review-score" aria-label={"Nota " + toStars(item.rating) + " de 5"}>
                          ★ {toStars(item.rating)}
                        </span>
                      )}
                      <time dateTime={item.at} title={new Date(item.at).toLocaleString("pt-BR")}>
                        {relativeTime(item.at)}
                      </time>
                    </p>
                    {item.review && <Spoiler hidden={item.spoiler}>{item.review}</Spoiler>}
                  </div>
                </li>
              );
            })}
          </ol>
          {error && (
            <p role="alert" className="message error">
              {error}{" "}
              <button disabled={busy} onClick={() => (loaded ? void more() : retry((n) => n + 1))}>
                Tentar novamente
              </button>
            </p>
          )}
          {loaded && next && (
            <button disabled={busy} onClick={() => void more()}>
              {busy ? "Carregando…" : "Ver mais antigos"}
            </button>
          )}
          {loaded && !next && items.length > 0 && <p className="muted">Você chegou ao fim do feed.</p>}
        </section>
      </main>
    </>
  );
}
