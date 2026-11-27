"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/client-api";
import type { Dashboard, DiaryResult, Viewing } from "../lib/dashboard-types";

export function DiaryDialog({
  dashboard,
  username,
  title,
  name,
  onClose,
  renderSession,
  visibility,
  message,
}: {
  dashboard: Dashboard;
  username?: string;
  title: string;
  name: string;
  onClose: () => void;
  renderSession: (item: Viewing) => ReactNode;
  visibility: ReactNode;
  message: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const [page, setPage] = useState(1);
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState<{ dashboard: Dashboard; page: number; data: DiaryResult } | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let active = true;
    setFailure("");
    const params = new URLSearchParams({ page: String(page), title });
    if (username) params.set("username", username);
    (async () => {
      const data = await api<DiaryResult>("diary?" + params);
      if (!active) return;
      if (!data.items.length && page > 1) {
        setPage(page - 1);
        return;
      }
      setResult({ dashboard, page, data });
    })().catch((error) => {
      if (active) setFailure(error.message);
    });
    return () => {
      active = false;
    };
  }, [dashboard, page, username, title, attempt]);
  const data = result?.page === page && result.dashboard === dashboard ? result.data : null;
  function navigate(next: number) {
    setFailure("");
    setPage(next);
  }
  return (
    <dialog
      ref={dialog}
      className="session-dialog diary-dialog"
      aria-labelledby="diary-heading"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="diary-heading">Diário · {name}</h2>
        <div className="diary-toolbar">
          {visibility && <span className="diary-visibility">Visibilidade do Diário {visibility}</span>}
          <button autoFocus onClick={onClose}>
            Fechar
          </button>
        </div>
      </header>
      {message && <p role="status">{message}</p>}
      {data ? (
        <>
          <ul className="diary-sessions">{data.items.map(renderSession)}</ul>
          {!data.items.length && <p className="muted">Nenhuma sessão registrada.</p>}
        </>
      ) : failure ? (
        <div role="alert">
          {failure}{" "}
          <button
            onClick={() => {
              setFailure("");
              retry((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <p role="status">Carregando sessões…</p>
      )}
      {(page > 1 || data?.hasMore) && (
        <nav className="row diary-pagination" aria-label="Páginas do Diário">
          <button disabled={page === 1} onClick={() => navigate(page - 1)}>
            Anterior
          </button>
          <span aria-live="polite">Página {page}</span>
          <button disabled={!data?.hasMore} onClick={() => navigate(page + 1)}>
            Próxima
          </button>
        </nav>
      )}
    </dialog>
  );
}
