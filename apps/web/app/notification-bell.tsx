"use client";
import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./ui-icons";

const reasons = {
  closedByHost: "O anfitrião desfez a sala.",
  closedByLeave: "A sala foi desfeita porque restaria apenas um participante.",
  expired: "O prazo da sala terminou.",
};
type Item = { kind: "friend" | "room" | keyof typeof reasons; target: string; label: string; sender: string };
type Inbox = { items: Item[]; total: number };

export function NotificationBell() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [inbox, setInbox] = useState<Inbox | null>(null),
    [failed, setFailed] = useState(false);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    function stop() {
      clearTimeout(timer);
      request?.abort();
    }
    async function load() {
      stop();
      if (document.hidden) return;
      const current = new AbortController();
      request = current;
      try {
        const response = await fetch("/api/v1/notifications", { cache: "no-store", signal: current.signal });
        if (!response.ok) throw Error();
        const next: Inbox = await response.json();
        if (!current.signal.aborted) {
          setInbox(next);
          setFailed(false);
        }
      } catch {
        if (!current.signal.aborted) setFailed(true);
      } finally {
        if (!current.signal.aborted && !document.hidden) timer = setTimeout(load, 60000);
      }
    }
    window.addEventListener("room-notifications-changed", load);
    document.addEventListener("visibilitychange", load);
    void load();
    return () => {
      stop();
      window.removeEventListener("room-notifications-changed", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [revision]);
  async function acknowledge(id: string) {
    try {
      const response = await fetch("/api/v1/notifications/rooms/" + id + "/read", { method: "PUT" });
      if (!response.ok) throw Error();
      refresh((n) => n + 1);
    } catch {
      setFailed(true);
    }
  }
  const total = inbox?.total ?? 0;
  return (
    <>
      <button
        type="button"
        className="notification-bell"
        aria-haspopup="dialog"
        title="Notificações"
        aria-label={total ? `Notificações: ${total} pendentes` : "Notificações"}
        onClick={() => {
          dialog.current?.showModal();
          refresh((n) => n + 1);
        }}
      >
        <UiIcon name="bell" />
        {total > 0 && (
          <span className="notification-count" aria-hidden="true">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      <dialog ref={dialog} className="session-dialog notification-dialog" aria-labelledby="notifications-heading">
        <header className="section-heading">
          <h2 id="notifications-heading">Notificações</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        {failed ? (
          <p role="alert">
            Não foi possível atualizar. <button onClick={() => refresh((n) => n + 1)}>Tentar novamente</button>
          </p>
        ) : !inbox ? (
          <p role="status">Carregando…</p>
        ) : null}
        {inbox?.items.length ? (
          <ul>
            {inbox.items.map((item) => (
              <li key={item.kind + item.target}>
                {item.kind === "friend" || item.kind === "room" ? (
                  <a
                    href={
                      item.kind === "friend"
                        ? "/?usuario=" + encodeURIComponent(item.target)
                        : "/salas?sala=" + encodeURIComponent(item.target)
                    }
                  >
                    <UiIcon name={item.kind === "friend" ? "friends" : "room"} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>
                        {item.kind === "friend" ? "Quer adicionar você como amigo" : "Convite de " + item.sender}
                      </small>
                    </span>
                  </a>
                ) : (
                  <div className="room-end-notice">
                    <span>
                      <strong>{item.label}</strong>
                      <small>{reasons[item.kind]}</small>
                    </span>
                    <button
                      type="button"
                      aria-label={"Marcar aviso de " + item.label + " como lido"}
                      onClick={() => void acknowledge(item.target)}
                    >
                      Marcar como lido
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : inbox && !failed ? (
          <p className="muted">Nenhuma notificação pendente.</p>
        ) : null}
        {inbox && total > inbox.items.length && (
          <p>
            Exibindo os {inbox.items.length} mais recentes. <a href="/amigos">Meus amigos</a> ·{" "}
            <a href="/salas">Minhas salas</a>
          </p>
        )}
      </dialog>
    </>
  );
}
