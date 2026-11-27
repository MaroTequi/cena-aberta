"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { returnPath } from "../../lib/return-path";
import { signIn } from "next-auth/react";

type Mode = "login" | "register" | "reset";

export default function Conta() {
  const [mode, setMode] = useState<Mode>("login");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [resetUntil, setResetUntil] = useState(0),
    [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, Math.ceil((resetUntil - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [resetUntil]);
  useEffect(() => {
    try {
      setResetUntil(Number(sessionStorage.getItem("password-reset-until")) || 0);
    } catch {}
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accountState = params.get("estado");
    if (accountState === "paused") setMessage("Conta pausada. Entre novamente para reativá-la.");
    if (accountState === "deleted") setMessage("Conta marcada como deletada. O acesso foi encerrado.");
    if (accountState === "active") setMessage("Conta reativada. Entre para continuar.");
    const destination = returnPath(params.get("next"));
    if (destination !== "/") sessionStorage.setItem("room-return", destination);
    const fragment = new URLSearchParams(location.hash.slice(1));
    for (const purpose of ["register", "reset"] as const) {
      const link = fragment.get(purpose);
      if (link) {
        setMode(purpose);
        setToken(link);
        const target = returnPath(sessionStorage.getItem("room-return"));
        history.replaceState(null, "", target === "/" ? "/conta" : "/conta?next=" + encodeURIComponent(target));
        return;
      }
    }
    if (params.get("modo") === "register") setMode("register");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (mode === "reset" && !token && resetUntil > Date.now())) return;
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    if (token && password !== form.get("confirmation")) {
      setError("As senhas não coincidem.");
      return;
    }
    if (token && new TextEncoder().encode(password).length > 72) {
      setError("Use uma senha de até 72 bytes.");
      return;
    }
    if (
      token &&
      (Array.from(password).length < 12 ||
        !/\p{Lu}/u.test(password) ||
        !/\p{Ll}/u.test(password) ||
        !/\p{Nd}/u.test(password) ||
        !/[^\p{L}\p{N}\s]/u.test(password))
    ) {
      setError("Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login" || token) {
        const result = await signIn("email-account", {
          email,
          password,
          token,
          purpose: mode,
          rememberMe: String(form.has("rememberMe")),
          redirect: false,
          callbackUrl: "/",
        });
        if (result?.ok && !result.error) {
          location.replace(returnPath(new URLSearchParams(location.search).get("next")));
          return;
        }
        setError(
          result?.error === "CredentialsSignin"
            ? "E-mail ou senha inválidos."
            : result?.error || "Não foi possível entrar.",
        );
      } else {
        const response = await fetch("/api/accounts/" + mode, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const result = await response.json();
        if (mode === "reset" && Number.isFinite(result.retryAfterSeconds) && result.retryAfterSeconds > 0) {
          const until = Date.now() + result.retryAfterSeconds * 1000;
          setResetUntil(until);
          try {
            sessionStorage.setItem("password-reset-until", String(until));
          } catch {}
        }
        if (response.ok) setMessage(result.message);
        else setError(result.message || "Não foi possível solicitar o link.");
      }
    } catch {
      setError("Serviço de contas temporariamente indisponível.");
    } finally {
      setBusy(false);
    }
  }

  function change(next: Mode) {
    setMode(next);
    setToken("");
    setError("");
    setMessage("");
    const destination = returnPath(new URLSearchParams(location.search).get("next"));
    history.replaceState(
      null,
      "",
      "/conta?" +
        new URLSearchParams({
          ...(next === "register" ? { modo: "register" } : {}),
          ...(destination !== "/" ? { next: destination } : {}),
        }),
    );
  }
  const title = token
    ? "Defina sua senha"
    : mode === "register"
      ? "Criar conta"
      : mode === "reset"
        ? "Recuperar senha"
        : "Entrar";
  const description = token ? (
    "Escolha a senha que você vai usar para entrar."
  ) : mode === "register" ? (
    "Confirme seu e-mail para criar sua conta."
  ) : mode === "reset" ? (
    "Vamos enviar um link para você definir uma nova senha."
  ) : (
    <>
      Acesse seu <strong className="profile-section-name">Diário</strong> e suas avaliações.
    </>
  );
  return (
    <main className="wrap account-page">
      <section className="panel account-panel" aria-labelledby="account-title">
        <Link className="account-brand" href="/">
          <span aria-hidden="true">◈</span> Cena Aberta
        </Link>
        <h1 id="account-title">{title}</h1>
        <p className="account-description">{description}</p>
        {error && (
          <p role="alert" className="message error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="message">
            {message}
          </p>
        )}
        <form className="form" key={mode + Boolean(token)} onSubmit={submit}>
          {!token && (
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                value={emailAddress}
                onChange={(event) => setEmailAddress(event.target.value)}
                maxLength={254}
                required
              />
            </label>
          )}
          {(mode === "login" || token) && (
            <div className="account-password">
              <div className="account-password-label">
                <label htmlFor="account-password">Senha</label>
                {mode === "login" && (
                  <button type="button" className="account-signin-link" onClick={() => change("reset")} disabled={busy}>
                    Esqueci a senha
                  </button>
                )}
              </div>
              <input
                id="account-password"
                name="password"
                type="password"
                autoComplete={token ? "new-password" : "current-password"}
                minLength={token ? 12 : undefined}
                maxLength={72}
                required
              />
            </div>
          )}
          {token && (
            <>
              <label>
                Confirme a senha
                <input
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
              </label>
              <small>Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.</small>
            </>
          )}
          {mode === "login" && (
            <label className="check">
              <input type="checkbox" name="rememberMe" />
              Manter conectado
            </label>
          )}
          <button className="primary account-submit" disabled={busy || (mode === "reset" && !token && remaining > 0)}>
            {busy
              ? "Aguarde…"
              : mode === "reset" && !token && remaining > 0
                ? `Reenviar em ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
                : token
                  ? "Salvar senha e entrar"
                  : mode === "login"
                    ? "Entrar"
                    : mode === "reset"
                      ? "Enviar link de recuperação"
                      : "Enviar link de confirmação"}
          </button>
        </form>
        {mode === "reset" ? (
          <nav className="account-recovery-nav" aria-label="Opções de acesso">
            <button type="button" className="account-recovery-back" onClick={() => change("login")} disabled={busy}>
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m10 5-7 7 7 7M3 12h18" />
              </svg>
              <span>Voltar para entrar</span>
            </button>
            <button
              type="button"
              className="account-recovery-create"
              onClick={() => change("register")}
              disabled={busy}
            >
              Criar conta
            </button>
          </nav>
        ) : (
          <div className="account-signin">
            <span>{mode === "login" ? "Novo por aqui?" : "Já tem uma conta?"}</span>
            <button
              type="button"
              className="account-signin-link"
              onClick={() => change(mode === "login" ? "register" : "login")}
              disabled={busy}
            >
              {mode === "login" ? "Criar conta" : "Entrar"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
