"use client";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/client-api";
import { expectedByNow, goalProgress } from "../../lib/stats";

/** Meta anual como vem de `GET/PUT /me/goal`. */
export type Goal = { year: number; target: number | null; done: number };

/**
 * Bloco da meta anual: barra de progresso, ritmo e formulário para definir ou remover a meta.
 * @param goal meta carregada do ano exibido
 * @param onSaved chamado com a meta devolvida pelo backend depois de salvar
 */
export function AnnualGoal({ goal, onSaved }: { goal: Goal; onSaved: (goal: Goal) => void }) {
  const [target, setTarget] = useState(goal.target ? String(goal.target) : ""),
    [editing, setEditing] = useState(!goal.target),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const progress = goalProgress(goal.done, goal.target);
  const expected = goal.target ? expectedByNow(goal.target, goal.year, new Date()) : 0;
  async function save(value: number | null) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<Goal>("me/goal", "PUT", { year: goal.year, target: value });
      onSaved(saved);
      setTarget(saved.target ? String(saved.target) : "");
      setEditing(!saved.target);
      setNotice(value === null ? "Meta removida." : "Meta salva.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save(Number(target));
  }
  return (
    <section className="panel goal-panel" aria-labelledby="goal-heading">
      <div className="section-heading">
        <h2 id="goal-heading">Meta de {goal.year}</h2>
        {progress && !editing && (
          <button type="button" className="small" onClick={() => setEditing(true)}>
            Alterar meta
          </button>
        )}
      </div>
      {progress ? (
        <>
          <p className="goal-count">
            <strong>{goal.done}</strong> de {goal.target} obras · {progress.percent}%
          </p>
          <div
            className="goal-bar"
            role="progressbar"
            aria-label={"Progresso da meta de " + goal.year}
            aria-valuemin={0}
            aria-valuemax={goal.target ?? 0}
            aria-valuenow={Math.min(goal.done, goal.target ?? 0)}
          >
            <span style={{ width: progress.percent + "%" }} />
          </div>
          <p className="muted">
            {progress.reached
              ? "Meta batida! Tudo o que vier agora é bônus."
              : (progress.remaining === 1 ? "Falta 1 obra" : "Faltam " + progress.remaining + " obras") +
                (expected > 0 && goal.done !== expected
                  ? goal.done > expected
                    ? ` · ${goal.done - expected} à frente do ritmo`
                    : ` · ${expected - goal.done} atrás do ritmo`
                  : expected > 0
                    ? " · no ritmo certo"
                    : "")}
          </p>
        </>
      ) : (
        <p className="muted">
          Defina quantas obras diferentes você quer ver em {goal.year}. Até agora: {goal.done}.
        </p>
      )}
      {editing && (
        <form className="goal-form" onSubmit={submit}>
          <label>
            Obras no ano
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {goal.target ? "Salvar meta" : "Definir meta"}
          </button>
          {goal.target && (
            <>
              <button type="button" disabled={busy} onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button type="button" disabled={busy} onClick={() => void save(null)}>
                Remover meta
              </button>
            </>
          )}
        </form>
      )}
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
