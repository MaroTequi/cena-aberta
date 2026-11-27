"use client";
import { useEffect, useState } from "react";
import { ProfileAvatar } from "./profile-form";
type Person = { username: string; name: string; avatar?: string };
export function ProfileFriends({ username }: { username: string }) {
  const [people, setPeople] = useState<Person[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load(offset = 0, signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/v1/friends/profile?username=" + encodeURIComponent(username) + "&offset=" + offset,
        { cache: "no-store", signal },
      );
      if (!response.ok) throw Error("Não foi possível carregar os amigos.");
      const data = await response.json();
      if (!signal?.aborted) {
        setPeople((old) => (offset ? [...old, ...data.items] : data.items));
        setMore(data.hasMore);
      }
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(0, controller.signal);
    return () => controller.abort();
  }, [username]);
  return (
    <section className="panel profile-friends" aria-label="Amigos do perfil">
      <h2>Amigos</h2>
      {people.map((person) => (
        <a
          className="friend-card friend-person"
          key={person.username}
          href={"/?usuario=" + encodeURIComponent(person.username)}
        >
          <ProfileAvatar name={person.name} avatar={person.avatar} />
          <span>
            <strong>{person.name}</strong>
            <small>@{person.username}</small>
          </span>
        </a>
      ))}
      {loading && <p role="status">Carregando amigos…</p>}
      {!loading && !error && !people.length && <p className="muted">Nenhuma amizade por aqui ainda.</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button disabled={loading} onClick={() => void load(people.length)}>
            Tentar novamente
          </button>
        </p>
      )}
      {more && !error && (
        <button disabled={loading} onClick={() => void load(people.length)}>
          Ver mais amigos
        </button>
      )}
    </section>
  );
}
