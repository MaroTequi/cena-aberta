"use client";
import { useState } from "react";

/** Nome do arquivo vindo do `Content-Disposition`, com um padrão seguro se faltar. */
function fileName(disposition: string | null): string {
  const match = disposition?.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? "cena-aberta.zip";
}

/** Botão "Exportar meus dados": baixa o ZIP com CSVs de `GET /api/v1/me/export`. */
export function ExportData() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/v1/me/export", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw Error(data?.message || "Não foi possível gerar a exportação. Tente novamente.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName(response.headers.get("Content-Disposition"));
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Download iniciado.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="form">
      <h2>Seus dados</h2>
      <p>
        Baixe um arquivo ZIP com planilhas (CSV) da sua biblioteca, notas e resenhas, Diário, ranking, coleções e notas
        por episódio. As obras aparecem pelo identificador do catálogo.
      </p>
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => void download()}>
          {busy ? "Gerando arquivo…" : "Exportar meus dados"}
        </button>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="message">
          {notice}
        </p>
      )}
    </section>
  );
}
