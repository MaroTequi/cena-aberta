"use client";

import { useState, type FormEvent } from "react";
import { reviewReportReasons } from "../lib/review-report-reasons";

export function ReviewReport({ title, username, version }: { title: string; username: string; version: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const details = String(new FormData(event.currentTarget).get("details") ?? "").trim();
    if (reason === "other" && !details) {
      setError("Descreva o motivo da denúncia.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/v1/titles/" + title + "/review-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, version, reason, details }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.message || "Não foi possível enviar a denúncia. Tente novamente.");
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar a denúncia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="review-report">
      {sent ? (
        <p role="status">Denúncia enviada para moderação.</p>
      ) : (
        <>
          <button
            type="button"
            className="small"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
              setError("");
            }}
          >
            Reportar resenha
          </button>
          {open && (
            <form className="form" onSubmit={submit}>
              <label>
                Motivo{" "}
                <select required value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)}>
                  <option value="">Selecione um motivo</option>
                  {Object.entries(reviewReportReasons).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {reason === "other" ? "Descreva o motivo" : "Detalhes (opcional)"}
                <textarea name="details" rows={3} maxLength={500} required={reason === "other"} disabled={saving} />
              </label>
              {error && (
                <p role="alert" className="message error">
                  {error}
                </p>
              )}
              <div className="row">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setOpen(false);
                    setError("");
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary" disabled={saving}>
                  {saving ? "Enviando…" : "Enviar denúncia"}
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
