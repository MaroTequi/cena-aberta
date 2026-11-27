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
import { StreamingServices } from "./streaming-services";
/** Seções da tela, na ordem do menu lateral. O id também é a âncora da URL (ex.: #streamings). */
const settingsSections = [
  {
    id: "preferencias",
    label: "Preferências",
    hint: "Cookies e avaliações",
    description: "Como o Cena Aberta se comporta neste navegador.",
  },
  {
    id: "streamings",
    label: "Meus streamings",
    hint: "O que você assina",
    description: "Os serviços marcados ficam em destaque em Onde assistir e valem para o filtro das salas.",
  },
  {
    id: "dados",
    label: "Seus dados",
    hint: "Exportar planilhas",
    description: "Leve sua biblioteca, notas, Diário e coleções para onde quiser.",
  },
  {
    id: "conta",
    label: "Conta",
    hint: "Pausar ou excluir",
    description: "Ações que mudam o acesso à sua conta. Todas pedem sua senha.",
  },
] as const;
type SettingsSection = (typeof settingsSections)[number]["id"];

/** Seção pedida na âncora da URL; sem âncora conhecida, abre Preferências. */
function sectionFromHash(hash: string): SettingsSection {
  const id = hash.replace("#", "");
  return settingsSections.some((option) => option.id === id) ? (id as SettingsSection) : "preferencias";
}

export function AccountSettings({ supported }: { supported: boolean }) {
  const [section, setSection] = useState<SettingsSection>("preferencias");
  useEffect(() => {
    const sync = () => setSection(sectionFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function choose(next: SettingsSection) {
    setSection(next);
    window.history.replaceState(null, "", "#" + next);
  }
  const current = settingsSections.find((option) => option.id === section) ?? settingsSections[0];
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
    <main className="wrap account-settings settings-page">
      <aside className="settings-sidebar">
        <h1>Configurações</h1>
        <nav className="settings-nav" aria-label="Seções das configurações">
          {settingsSections.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-current={section === option.id ? "page" : undefined}
              onClick={() => choose(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </button>
          ))}
        </nav>
        <div className="settings-sidebar-footer">
          <Link className="room-nav-button" href="/?aba=profile">
            <span aria-hidden="true">←</span> Meu perfil
          </Link>
          <button type="button" onClick={() => void signOut({ callbackUrl: "/conta" })}>
            Sair
          </button>
        </div>
      </aside>
      <section className="panel settings-content" aria-labelledby="settings-heading">
        <header className="settings-heading">
          <h2 id="settings-heading">{current.label}</h2>
          <p>{current.description}</p>
        </header>
        {section === "preferencias" && (
          <div className="settings-cards">
            <section className="form settings-card">
              <h3>Cookies e armazenamento</h3>
              <p>
                Os cookies essenciais mantêm sua sessão. Escolha por quanto tempo guardar tema e formato de avaliação
                neste navegador.
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
            <section className="form account-ratings settings-card">
              <h3>Formato de avaliação</h3>
              <RatingPreference />
            </section>
          </div>
        )}
        {section === "streamings" && <StreamingServices />}
        {section === "dados" && <ExportData />}
        {section === "conta" && (
          <div className="settings-cards">
            {!supported ? (
              <p>Gerencie esta conta pelo seu provedor de acesso.</p>
            ) : !state && !error ? (
              <p role="status">Carregando conta…</p>
            ) : (
              <>
                {state === "paused" ? (
                  <section className="settings-card">
                    <h3>Conta pausada</h3>
                    <p>
                      Seu perfil está oculto e suas interações estão bloqueadas. Seus dados continuam salvos. Reative
                      quando quiser voltar.
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
                  </section>
                ) : state === "active" ? (
                  <section className="settings-card">
                    <h3>Pausar conta</h3>
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
                  </section>
                ) : null}
                {state && (
                  <section className="settings-card account-danger">
                    <h3>Excluir conta</h3>
                    <p>
                      Sua conta será deletada. Você poderá criar uma nova conta com o mesmo e-mail e começar com um
                      perfil vazio.
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
                  <form className="form settings-card account-confirm" onSubmit={submit}>
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
          </div>
        )}
      </section>
    </main>
  );
}
