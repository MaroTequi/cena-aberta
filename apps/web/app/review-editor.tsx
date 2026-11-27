"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SpoilerControl } from "./action-icons";
export function ReviewEditor({
  title,
  initial,
  disabled,
  onSaved,
  onPending,
  visibility,
}: {
  title: string;
  initial: { review: string | null; spoiler: boolean; version: number; evaluation_public?: boolean };
  disabled: boolean;
  onSaved: () => Promise<void>;
  onPending: (value: boolean) => void;
  visibility: ReactNode;
}) {
  const inputId = useId();
  const [review, setReview] = useState(initial.review ?? ""),
    [spoiler, setSpoiler] = useState(initial.spoiler),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(!initial.review);
  const [conflict, setConflict] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const saved = useRef({ review: initial.review ?? "", spoiler: initial.spoiler, version: initial.version }),
    pending = useRef(false);
  const dirty = review !== saved.current.review || spoiler !== saved.current.spoiler;
  async function save() {
    if (pending.current || !dirty) return;
    pending.current = true;
    setConfirmed(false);
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/v1/me/library/" + title + "/review", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review, spoiler, version: saved.current.version }),
      });
      const data = await r.json();
      if (r.status === 409) {
        setConflict(true);
        setEditing(false);
        setReloadRequired(true);
        setReview(saved.current.review);
        setSpoiler(saved.current.spoiler);
        const response = await fetch("/api/v1/me", { cache: "no-store" });
        if (!response.ok) throw Error("Não foi possível carregar a versão mais recente.");
        const dashboard = await response.json();
        const latest = dashboard.library?.find((item: { title: string }) => item.title === title);
        if (!latest) throw Error("Resenha indisponível.");
        saved.current = { review: latest.review ?? "", spoiler: latest.spoiler, version: latest.version };
        setReview(saved.current.review);
        setSpoiler(saved.current.spoiler);
        setReloadRequired(false);
        void onSaved().catch(() => {});
        return;
      }
      if (!r.ok) throw Error(data.message || "Não foi possível salvar a resenha.");
      const stored = data.review ?? "";
      saved.current = { review: stored, spoiler: data.spoiler, version: data.version };
      setReview(stored);
      setSpoiler(data.spoiler);
      setEditing(!stored);
      setConflict(false);
      setConfirmed(true);
      void onSaved().catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    onPending(dirty || saving);
  }, [dirty, saving, onPending]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || saving) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  function cancel() {
    setReview(saved.current.review);
    setSpoiler(saved.current.spoiler);
    setEditing(!saved.current.review);
    setConflict(false);
    setError("");
  }
  if (reloadRequired)
    return (
      <div className="form" role="status">
        <p className="message review-conflict">Edição cancelada. Outra sessão já salvou uma alteração.</p>
        {saving ? (
          <small>Carregando resenha…</small>
        ) : (
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar página
          </button>
        )}
      </div>
    );
  if (!editing)
    return (
      <div className="form">
        <strong>Minha resenha</strong>
        <p className="review-text">{review || "Sem resenha."}</p>
        {conflict && (
          <p className="message review-conflict" role="status">
            Edição cancelada. A alteração salva na outra sessão foi mantida.
          </p>
        )}
        <div className="row">
          {visibility}
          {initial.evaluation_public && spoiler && <small>Contém spoiler</small>}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setConfirmed(false);
              setConflict(false);
              setEditing(true);
            }}
          >
            {review ? "Editar resenha" : "Escrever resenha"}
          </button>
        </div>
        {confirmed && (
          <p className="message" role="status">
            ✓ Resenha salva.
          </p>
        )}
      </div>
    );
  return (
    <div className="form">
      <label htmlFor={inputId}>Minha resenha</label>
      <textarea
        id={inputId}
        name="review"
        maxLength={3000}
        value={review}
        disabled={disabled || saving}
        onChange={(e) => {
          setConfirmed(false);
          setReview(e.target.value);
          setError("");
        }}
      />
      <div className="row">
        <span className="review-controls">
          {visibility}
          {initial.evaluation_public && (
            <SpoilerControl
              initial={spoiler}
              disabled={disabled || saving}
              onChange={(value) => {
                setConfirmed(false);
                setSpoiler(value);
                setError("");
              }}
            />
          )}
        </span>
      </div>
      <button type="button" className="primary" disabled={disabled || saving || !dirty} onClick={() => void save()}>
        {saving ? "Salvando…" : "Salvar resenha"}
      </button>
      {(saved.current.review || conflict) && (
        <button type="button" disabled={saving} onClick={cancel}>
          Cancelar edição
        </button>
      )}
      <div role="status" aria-atomic="true" className="review-status">
        {confirmed ? (
          <p className="message">
            <span aria-hidden="true">✓ </span>Resenha salva.
          </p>
        ) : (
          <small>{saving ? "Salvando resenha…" : dirty ? "Alterações ainda não salvas." : ""}</small>
        )}
      </div>
      {error && (
        <p className="message error" role="alert">
          {error}{" "}
          <button type="button" disabled={saving} onClick={() => void save()}>
            Tentar novamente
          </button>
        </p>
      )}
    </div>
  );
}
