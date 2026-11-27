"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/client-api";
import { relativeTime } from "../../lib/social-format";
import { ProfileAvatar } from "../profile-form";
import { UiIcon } from "../ui-icons";

type Comment = {
  id: string;
  author: { username: string; name: string; avatar?: string };
  body: string;
  at: string;
  mine: boolean;
  canDelete: boolean;
};

/** Lista e formulário de comentários de uma resenha (carregados quando a pessoa abre). */
function ReviewComments({
  titleId,
  author,
  onTotal,
}: {
  titleId: string;
  author: string;
  /** Atualiza o contador do pai; precisa ser estável (ex.: um `setState`). */
  onTotal: (update: (total: number) => number) => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ items: Comment[]; total: number }>(
      "titles/" + titleId + "/review-comments?username=" + encodeURIComponent(author),
    )
      .then((data) => {
        if (!active) return;
        setComments(data.items);
        onTotal(() => data.total);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [titleId, author, attempt, onTotal]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<Comment>("titles/" + titleId + "/review-comments", "POST", {
        username: author,
        body: text,
      });
      setComments((old) => [...(old ?? []), created]);
      onTotal((total) => total + 1);
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(comment: Comment) {
    if (busy || !window.confirm("Apagar este comentário?")) return;
    setBusy(true);
    setError("");
    try {
      await api("titles/" + titleId + "/review-comments/" + comment.id, "DELETE");
      setComments((old) => old?.filter((c) => c.id !== comment.id) ?? null);
      onTotal((total) => Math.max(0, total - 1));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-comments">
      {!comments && !error && <p role="status">Carregando comentários…</p>}
      {comments && !comments.length && <p className="muted">Nenhum comentário ainda. Comece a conversa.</p>}
      {comments && comments.length > 0 && (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id} className="review-comment">
              <ProfileAvatar name={comment.author.name} avatar={comment.author.avatar} />
              <div>
                <p className="review-comment-head">
                  <Link href={"/?usuario=" + encodeURIComponent(comment.author.username)}>
                    <strong>{comment.author.name}</strong>
                  </Link>{" "}
                  <small>
                    <time dateTime={comment.at}>{relativeTime(comment.at)}</time>
                  </small>
                </p>
                <p className="review-text">{comment.body}</p>
              </div>
              {comment.canDelete && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={"Apagar comentário de " + comment.author.name}
                  title="Apagar comentário"
                  onClick={() => void remove(comment)}
                >
                  <UiIcon name="trash" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="review-comment-form" onSubmit={send}>
        <label className="sr-only" htmlFor={"comment-" + author}>
          Escreva um comentário
        </label>
        <textarea
          id={"comment-" + author}
          value={body}
          maxLength={1000}
          placeholder="Escreva um comentário…"
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="primary" disabled={busy || !body.trim()}>
          Comentar
        </button>
      </form>
      {error && (
        <p role="alert" className="message error">
          {error}{" "}
          {!comments && (
            <button
              onClick={() => {
                setError("");
                retry((n) => n + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Curtidas e comentários de uma resenha da comunidade.
 * @param titleId id da obra
 * @param author username de quem escreveu a resenha
 * @param own se a resenha é de quem está logado (não pode curtir a própria)
 * @param initial contadores vindos de `GET /titles/{id}/community`
 */
export function ReviewSocial({
  titleId,
  author,
  own,
  initial,
}: {
  titleId: string;
  author: string;
  own: boolean;
  initial: { likes?: number; liked?: boolean; comments?: number };
}) {
  const [likes, setLikes] = useState(initial.likes ?? 0),
    [liked, setLiked] = useState(!!initial.liked),
    [comments, setComments] = useState(initial.comments ?? 0),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggleLike() {
    if (busy || own) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ likes: number; liked: boolean }>("titles/" + titleId + "/review-like", "PUT", {
        username: author,
        value: !liked,
      });
      setLikes(result.likes);
      setLiked(result.liked);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const likeLabel = likes === 1 ? "1 curtida" : likes + " curtidas";
  return (
    <div className="review-social">
      <div className="row">
        {own ? (
          <span className="review-like" aria-label={likeLabel}>
            <UiIcon name="heart" /> {likes}
          </span>
        ) : (
          <button
            type="button"
            className="review-like"
            aria-pressed={liked}
            aria-label={(liked ? "Descurtir resenha" : "Curtir resenha") + " · " + likeLabel}
            title={liked ? "Descurtir" : "Curtir"}
            disabled={busy}
            onClick={() => void toggleLike()}
          >
            <UiIcon name="heart" /> {likes}
          </button>
        )}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          <UiIcon name="comment" /> {comments === 1 ? "1 comentário" : comments + " comentários"}
        </button>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {open && <ReviewComments titleId={titleId} author={author} onTotal={setComments} />}
    </div>
  );
}
