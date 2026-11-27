"use client";
import { useEffect, useState } from "react";

const messages: Record<string, string> = {
  working: "Preparando o backup…",
  sent: "Link enviado ao seu e-mail. Válido por 24 horas.",
  failed: "Falha ao preparar ou enviar o backup. Tente novamente.",
  busy: "Outro backup está em andamento. Tente novamente em instantes.",
  forbidden: "É necessário um administrador com e-mail ativo.",
  unavailable: "Serviço de backup indisponível.",
};

async function requestBackup(method: string) {
  const response = await fetch("/api/v1/backups", { method, cache: "no-store" });
  return (await response.json()).status ?? "unavailable";
}

export function AdminBackup() {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const result = await requestBackup("GET").catch(() => "unavailable");
      if (!active) return;
      setStatus(result);
      if (result === "working") timer = setTimeout(refresh, 3000);
    }
    if (status === "loading" || status === "working") void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [status]);
  async function start() {
    setStatus("submitting");
    setStatus(await requestBackup("POST").catch(() => "unavailable"));
  }
  return (
    <section className="panel">
      <h2>Backup dos bancos</h2>
      <button disabled={["loading", "submitting", "working", "sent"].includes(status)} onClick={start}>
        Receber backup por e-mail
      </button>
      <p role="status">{messages[status]}</p>
    </section>
  );
}
