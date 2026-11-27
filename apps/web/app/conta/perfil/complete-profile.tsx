"use client";
import { useState } from "react";
import { returnPath } from "../../../lib/return-path";
import { signOut } from "next-auth/react";
import { ProfileForm, type ProfileInput } from "../../profile-form";
export function CompleteProfile() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(input: ProfileInput) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/me/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message ?? "Não foi possível salvar seu perfil.");
      }
      sessionStorage.removeItem("room-return");
      location.replace(returnPath(new URLSearchParams(location.search).get("next")));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível salvar seu perfil.");
      setBusy(false);
    }
  }
  return (
    <main className="wrap account-page">
      <section className="panel account-panel">
        <span className="account-brand">Cena Aberta</span>
        <h1>Complete seu perfil</h1>
        <p className="account-description">Escolha seu nome e usuário para começar. A imagem é opcional.</p>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        <ProfileForm busy={busy} onSave={save} />
        <div className="account-signin">
          <button className="account-signin-link" disabled={busy} onClick={() => signOut({ callbackUrl: "/conta" })}>
            Sair da conta
          </button>
        </div>
      </section>
    </main>
  );
}
