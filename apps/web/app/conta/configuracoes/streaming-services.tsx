"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/client-api";
import { toggleProvider, type Provider } from "../../../lib/streaming";
import { ProviderLogo } from "../../provider-logo";

/**
 * Seção "Meus streamings" das configurações: a pessoa marca os serviços que assina. Cada toque
 * salva a lista inteira; se o salvamento falhar, a marcação volta ao que estava.
 */
export function StreamingServices() {
  const [options, setOptions] = useState<Provider[] | null>(null),
    [selected, setSelected] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api<Provider[]>("providers"), api<{ providers: number[] }>("me/providers")])
      .then(([available, mine]) => {
        if (!active) return;
        setOptions(available);
        setSelected(mine.providers);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function toggle(id: number) {
    if (busy) return;
    const previous = selected;
    const next = toggleProvider(selected, id);
    setSelected(next);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<{ providers: number[] }>("me/providers", "PUT", { providers: next });
      setSelected(saved.providers);
      setNotice("Streamings salvos.");
    } catch (failure) {
      setSelected(previous);
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // O filtro ignora maiúsculas e acentos; a ordem é a do TMDB, para os botões não pularem ao marcar.
  const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const visible = (options ?? []).filter((provider) => fold(provider.name).includes(fold(filter.trim())));
  return (
    <section className="form streaming-services" id="streamings" aria-label="Meus streamings">
      <div className="streaming-toolbar">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filtrar serviços…"
          aria-label="Filtrar serviços de streaming"
        />
        <span className="streaming-count" role="status">
          {selected.length === 1 ? "1 marcado" : selected.length + " marcados"}
        </span>
      </div>
      {!options && !error && <p role="status">Carregando serviços…</p>}
      {options && !options.length && <p className="muted">Nenhum serviço disponível no momento.</p>}
      {options && options.length > 0 && !visible.length && (
        <p className="muted">Nenhum serviço com “{filter.trim()}”.</p>
      )}
      {options && options.length > 0 && !!visible.length && (
        <div className="provider-options" role="group" aria-label="Serviços de streaming">
          {visible.map((provider) => (
            <button
              type="button"
              key={provider.id}
              className="provider-chip"
              aria-pressed={selected.includes(provider.id)}
              aria-disabled={busy || undefined}
              onClick={() => void toggle(provider.id)}
            >
              <ProviderLogo provider={provider} />
              <span>{provider.name}</span>
            </button>
          ))}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="message error" role="alert">
          {error}{" "}
          {!options && (
            <button
              type="button"
              onClick={() => {
                setError("");
                retry((n) => n + 1);
              }}
            >
              Tentar novamente
            </button>
          )}
        </p>
      )}
    </section>
  );
}
