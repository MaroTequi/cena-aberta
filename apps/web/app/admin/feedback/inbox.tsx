"use client";
import { useEffect, useState } from "react";
import { ReviewReports } from "./review-reports";
import { AdminBackup } from "./backup";
import { ProfileAvatar } from "../../profile-form";
type Item = {
  images: string[];
  thanks: string;
  attempts: number;
  queued_at: string | null;
  claim: string | null;
  id: string;
  kind: string;
  description: string;
  page: string;
  app_version: string;
  status: string;
  created: string;
  name: string;
  username: string;
  avatar: string;
};
const labels: Record<string, string> = { new: "Novo", reviewing: "Em análise", resolved: "Resolvido" };
function FeedbackAttachments({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const count = item.images.length;
  if (!count) return null;
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{count === 1 ? "1 anexo" : count + " anexos"}</summary>
      {open && (
        <div className="feedback-images">
          {item.images?.map((id, index) => (
            <a
              key={id}
              href={"/api/v1/feedback/" + item.id + "/images/" + id}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={"Abrir anexo " + (index + 1)}
            >
              <img
                loading="lazy"
                src={"/api/v1/feedback/" + item.id + "/images/" + id}
                alt={"Anexo " + (index + 1)}
                onError={(e) => {
                  e.currentTarget.alt = "Anexo removido";
                }}
              />
            </a>
          ))}
        </div>
      )}
    </details>
  );
}
export function FeedbackInbox() {
  const [items, setItems] = useState<Item[]>([]),
    [status, setStatus] = useState("all"),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/v1/feedback?status=${status}&offset=${offset}`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message ?? "Não foi possível carregar.");
        if (active) {
          setItems(data.items);
          setMore(data.hasMore);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status, offset, revision]);
  async function change(id: string, value: string) {
    if (
      value === "resolved" &&
      !confirm("Marcar como resolvido? Os anexos serão apagados e o autor do bug receberá um e-mail de agradecimento.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/feedback/" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.message ?? "Não foi possível atualizar.");
      }
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function reconcile(item: Item, decision: "sent" | "retry") {
    if (
      !confirm(
        decision === "sent"
          ? "O provedor confirmou o aceite deste e-mail?"
          : "Você verificou no provedor que este e-mail não foi aceito? Agendar novo envio?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/feedback/" + item.id + "/thanks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: item.claim, decision }),
      });
      if (!response.ok) throw new Error("Não foi possível registrar a decisão. Atualize a caixa e confira o envio.");
      setRevision((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="wrap feedback-inbox">
      <header className="room-header">
        <a href="/" className="account-brand">
          Cena Aberta
        </a>
        <a href="/?aba=profile" className="room-nav-button">
          Meu perfil
        </a>
      </header>
      <span className="room-eyebrow">ADMINISTRAÇÃO</span>
      <h1>Feedback da comunidade</h1>
      <p>Relatos privados de bugs e sugestões.</p>
      <div className="row">
        <label>
          Mostrar{" "}
          <select
            value={status}
            disabled={busy}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="all">Todos</option>
            {Object.entries(labels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || loading} onClick={() => setRevision((n) => n + 1)}>
          Atualizar
        </button>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando relatos…</p>
      ) : items.length === 0 ? (
        <section className="panel">
          <h2>Nenhum relato por aqui</h2>
          <p>Os feedbacks enviados pelos participantes aparecerão nesta caixa.</p>
        </section>
      ) : (
        items.map((item) => (
          <article className="panel feedback-item" key={item.id}>
            <div className="feedback-item-heading">
              <div className="row">
                <ProfileAvatar name={item.name} avatar={item.avatar} />
                <div>
                  <strong>{item.name}</strong>
                  <small>@{item.username}</small>
                </div>
              </div>
              <span className="feedback-badge">{item.kind === "bug" ? "Bug" : "Sugestão"}</span>
            </div>
            <p className="review-text">{item.description}</p>
            <FeedbackAttachments item={item} />
            {item.status === "resolved" && <p className="muted">Anexos removidos.</p>}
            {item.thanks !== "none" && (
              <section aria-label="Agradecimento">
                <p>
                  {
                    (
                      {
                        sent: "Agradecimento aceito pelo provedor.",
                        pending: "Agradecimento na fila.",
                        sending: "Enviando agradecimento…",
                        skipped: "Autor sem e-mail disponível.",
                        uncertain: "Envio incerto. Confira o histórico no provedor antes de decidir.",
                      } as Record<string, string>
                    )[item.thanks]
                  }
                </p>
                <small>
                  Tentativas: {item.attempts}
                  {item.queued_at && " · Na fila desde " + new Date(item.queued_at).toLocaleString("pt-BR")}
                </small>
                {item.thanks === "uncertain" && (
                  <div className="row">
                    <button disabled={busy} onClick={() => void reconcile(item, "sent")}>
                      Confirmar aceite
                    </button>
                    <button disabled={busy} onClick={() => void reconcile(item, "retry")}>
                      Agendar reenvio
                    </button>
                  </div>
                )}
              </section>
            )}
            <p className="muted">
              <small>
                {new Date(item.created).toLocaleString("pt-BR")} · {item.page} · v{item.app_version}
              </small>
            </p>
            <label>
              Status{" "}
              <select
                aria-label={"Status do relato de " + item.name}
                disabled={busy}
                value={item.status}
                onChange={(e) => void change(item.id, e.target.value)}
              >
                {Object.entries(labels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </article>
        ))
      )}
      <div className="row">
        <button disabled={busy || loading || offset === 0} onClick={() => setOffset((n) => n - 50)}>
          Anterior
        </button>
        <span>Página {offset / 50 + 1}</span>
        <button disabled={busy || loading || !more} onClick={() => setOffset((n) => n + 50)}>
          Próxima
        </button>
      </div>
      <ReviewReports />
      <AdminBackup />
    </main>
  );
}
