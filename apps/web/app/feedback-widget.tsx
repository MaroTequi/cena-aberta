"use client";
import { useEffect, useRef, useState } from "react";
import { compressFeedbackImage } from "../lib/feedback-images";
import { usePathname } from "next/navigation";
export function FeedbackWidget({ version }: { version: string }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [access, setAccess] = useState<{ admin: boolean } | null>(null),
    [kind, setKind] = useState("bug"),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const [images, setImages] = useState<string[]>([]),
    [preparing, setPreparing] = useState(false);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const [enlarged, setEnlarged] = useState("");
  const id = useRef("");
  useEffect(() => {
    let active = true;
    fetch("/api/v1/feedback/access", { cache: "no-store" })
      .then(async (r) => {
        if (active) setAccess(r.ok ? await r.json() : null);
      })
      .catch(() => {
        if (active) setAccess(null);
      });
    return () => {
      active = false;
    };
  }, [pathname]);
  function open() {
    id.current = crypto.randomUUID();
    setError("");
    setSent(false);
    setDescription("");
    setImages([]);
    dialog.current?.showModal();
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preparing || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.current, kind, description, page: pathname, version, images }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? "Falha ao enviar.");
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function attach(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files);
    if (images.length + selected.length > 4) {
      setError("Adicione no máximo 4 imagens.");
      return;
    }
    setPreparing(true);
    setError("");
    try {
      const next: string[] = [];
      for (const file of selected) next.push(await compressFeedbackImage(file));
      setImages((previous) => [...previous, ...next]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }
  if (!access) return null;
  return (
    <>
      <div className="feedback-dock">
        {access.admin && (
          <a className="feedback-admin-link" href="/admin/feedback" aria-label="Abrir painel de feedback">
            Painel ADM
          </a>
        )}
        <button ref={trigger} className="feedback-trigger" onClick={open}>
          <svg
            viewBox="0 0 24 24"
            width="21"
            height="21"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V5a2 2 0 0 1 2-2Z" />
            <path d="M8 8h8M8 12h5" />
          </svg>
          <span>Enviar feedback</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className="feedback-dialog"
        aria-labelledby="feedback-title"
        onClose={() => trigger.current?.focus()}
        onCancel={(e) => {
          if (busy || preparing) e.preventDefault();
        }}
      >
        <div className="feedback-heading">
          <h2 id="feedback-title">{sent ? "Obrigado pelo feedback!" : "Ajude a melhorar o Cena Aberta"}</h2>
          <button
            type="button"
            aria-label="Fechar feedback"
            disabled={busy || preparing}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {sent ? (
          <>
            <p role="status">Seu relato foi enviado para a caixa interna dos administradores.</p>
            <button className="primary" onClick={() => dialog.current?.close()}>
              Concluir
            </button>
          </>
        ) : (
          <form className="form" onSubmit={send}>
            <p className="muted">Relatos privados, visíveis apenas à administração.</p>
            <fieldset className="feedback-types">
              <legend>O que você quer reportar?</legend>
              <label>
                <input
                  type="radio"
                  name="feedback-kind"
                  value="bug"
                  checked={kind === "bug"}
                  onChange={() => setKind("bug")}
                />{" "}
                Bug
              </label>
              <label>
                <input
                  type="radio"
                  name="feedback-kind"
                  value="suggestion"
                  checked={kind === "suggestion"}
                  onChange={() => setKind("suggestion")}
                />{" "}
                Sugestão de melhoria
              </label>
            </fieldset>
            <label>
              Descrição
              <textarea
                required
                minLength={10}
                maxLength={3000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={kind === "bug" ? "O que aconteceu?" : "O que você gostaria de melhorar e por quê?"}
              />
            </label>
            <small>{description.length}/3000 · Não inclua senhas ou outros dados sensíveis.</small>
            <div className="feedback-attachments">
              <label>
                Imagens (opcional, até 4)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={busy || preparing || images.length >= 4}
                  onChange={(e) => {
                    void attach(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <small>
                Prints são comprimidos para até 1 MB cada. Confira a legibilidade e remova dados pessoais antes de
                enviar. Anexos são apagados quando o relato é resolvido ou para liberar espaço.
              </small>
              <div className="feedback-images">
                {images.map((src, index) => (
                  <figure key={src}>
                    <button
                      type="button"
                      className="feedback-preview"
                      aria-label={"Ampliar imagem " + (index + 1)}
                      onClick={() => {
                        setEnlarged(src);
                        imageDialog.current?.showModal();
                      }}
                    >
                      <img src={src} alt={"Anexo " + (index + 1)} />
                    </button>
                    <button
                      type="button"
                      disabled={busy || preparing}
                      onClick={() => setImages((current) => current.filter((_, i) => i !== index))}
                      aria-label={"Remover imagem " + (index + 1)}
                    >
                      Remover
                    </button>
                  </figure>
                ))}
              </div>
              {preparing && <p role="status">Preparando imagens…</p>}
            </div>
            <small className="muted">
              Página: {pathname} · Versão: {version}. Parâmetros e links de confirmação não são enviados.
            </small>
            {error && (
              <p role="alert" className="message error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy || preparing || description.trim().length < 10}>
              {busy ? "Enviando…" : "Enviar feedback"}
            </button>
          </form>
        )}
      </dialog>
      <dialog className="feedback-image-dialog" ref={imageDialog} aria-label="Imagem anexada">
        <button type="button" autoFocus onClick={() => imageDialog.current?.close()}>
          Fechar imagem
        </button>
        {enlarged && <img src={enlarged} alt="Prévia do anexo" />}
      </dialog>
    </>
  );
}
