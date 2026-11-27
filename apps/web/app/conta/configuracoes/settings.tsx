"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import {
  subscribePreferences,
  preferenceDuration,
  canPersistPreferences,
  allowPreferences,
} from "../../../lib/browser-preferences";
import { RatingPreference } from "../../star-rating";
import { signOut } from "next-auth/react";
import { ExportData } from "./export-data";
export function AccountSettings({ supported }: { supported: boolean }) {
  const [state, setState] = useState(""),
    [action, setAction] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const duration = useSyncExternalStore(subscribePreferences, preferenceDuration, () => "persistent");
  const canPersist = useSyncExternalStore(subscribePreferences, canPersistPreferences, () => true);
  async function load() {
    setError("");
    try {
      const r = await fetch("/api/accounts/management", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.message);
      setState(d.state);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (supported) void load();
  }, [supported]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/accounts/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, password }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.message || "Não foi possível atualizar a conta.");
      setPassword("");
      await signOut({ callbackUrl: "/conta?estado=" + d.state });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="wrap account-settings">
      <Link className="account-brand" href="/">
        Cena Aberta
      </Link>
      <section className="panel">
        <h1>Minha conta</h1>
        <section className="form">
          <h2>Cookies e armazenamento</h2>
          <p>
            Os cookies essenciais mantêm sua sessão. Escolha por quanto tempo guardar tema e formato de avaliação neste
            navegador.
          </p>
          <label>
            Duração das preferências
            <select
              value={duration}
              disabled={!canPersist}
              onChange={(event) => allowPreferences(event.target.value === "persistent")}
            >
              <option value="persistent" disabled={!canPersist}>
                Lembrar neste navegador
              </option>
              {duration === "memory" ? (
                <option value="memory">Até recarregar a página</option>
              ) : (
                <option value="session">Somente nesta aba</option>
              )}
            </select>
          </label>
          {duration === "memory" ? (
            <p role="status">O navegador bloqueou o armazenamento. As escolhas valem até recarregar a página.</p>
          ) : (
            !canPersist && <p role="status">O navegador permite guardar as escolhas apenas nesta aba.</p>
          )}
        </section>
        <section className="form account-ratings">
          <h2>Avaliações</h2>
          <RatingPreference />
        </section>
        <ExportData />
        {!supported ? (
          <p>Gerencie esta conta pelo seu provedor de acesso.</p>
        ) : !state && !error ? (
          <p role="status">Carregando conta…</p>
        ) : (
          <>
            {state === "paused" ? (
              <>
                <h2>Conta pausada</h2>
                <p>
                  Seu perfil está oculto e suas interações estão bloqueadas. Seus dados continuam salvos. Reative quando
                  quiser voltar.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    setAction("resume");
                    setPassword("");
                  }}
                >
                  Reativar conta
                </button>
              </>
            ) : state === "active" ? (
              <>
                <h2>Pausar conta</h2>
                <p>
                  Oculte seu perfil e interrompa suas interações. Seus dados ficam salvos até você reativar a conta.
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    setAction("pause");
                    setPassword("");
                  }}
                >
                  Pausar minha conta
                </button>
              </>
            ) : null}
            {state && (
              <section className="account-danger">
                <h2>Excluir conta</h2>
                <p>
                  Sua conta será deletada. Você poderá criar uma nova conta com o mesmo e-mail e começar com um perfil
                  vazio.
                </p>
                <button
                  disabled={busy}
                  onClick={() => {
                    setAction("delete");
                    setPassword("");
                  }}
                >
                  Excluir minha conta
                </button>
              </section>
            )}
            {action && (
              <form className="form account-confirm" onSubmit={submit}>
                <h3>
                  {action === "delete"
                    ? "Confirmar exclusão"
                    : action === "pause"
                      ? "Confirmar pausa"
                      : "Confirmar reativação"}
                </h3>
                <label>
                  Confirme sua senha
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={72}
                  />
                </label>
                <p>Ao confirmar, suas sessões serão encerradas.</p>
                <div className="row">
                  <button className="primary" disabled={busy}>
                    {busy ? "Confirmando…" : "Confirmar"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setAction("");
                      setPassword("");
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        {error && (
          <p className="message error" role="alert">
            {error}
            {!state && <button onClick={() => void load()}>Tentar novamente</button>}
          </p>
        )}
        <nav className="account-settings-nav" aria-label="Navegação da conta">
          <Link className="room-nav-button" href="/?aba=profile">
            <span aria-hidden="true">←</span> Voltar ao meu perfil
          </Link>
          <button onClick={() => void signOut({ callbackUrl: "/conta" })}>Sair</button>
        </nav>
      </section>
    </main>
  );
}
