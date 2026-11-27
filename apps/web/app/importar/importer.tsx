"use client";
import Link from "next/link";
import { useRef, useState } from "react";
type Row = {
  kind: string;
  name: string;
  year: string;
  rating: number | null;
  review: string;
  date: string;
  rewatch: boolean;
  list: string;
  occurrence: number;
  title: string | null;
};
type Film = { id: string; name: string; original: string; year: string; poster: string | null };
type Match = {
  key: string;
  name: string;
  year: string;
  query: string;
  candidates: Film[];
  selected: string;
  status: string;
  needsSearch: boolean;
};
const key = (r: Row) => r.name + "\u0000" + r.year;
const normal = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
async function result(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Não foi possível concluir.");
  return data;
}
export function LetterboxdImporter() {
  const [rows, setRows] = useState<Row[]>([]),
    [matches, setMatches] = useState<Match[]>([]),
    [warnings, setWarnings] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [searching, setSearching] = useState(false),
    [complete, setComplete] = useState(false);
  const stopped = useRef(false);
  const processed = useRef(new Map<number, { added: boolean; title: string; date: string; occurrence: number }>());
  const [dates, setDates] = useState<Record<number, string>>({});
  const [privacy, setPrivacy] = useState<number[]>([]);
  const [allowPublic, setAllowPublic] = useState<Record<number, string>>({});
  const [fileName, setFileName] = useState(""),
    [onlyPending, setOnlyPending] = useState(false);
  function update(k: string, patch: Partial<Match>) {
    setMatches((old) => old.map((m) => (m.key === k ? { ...m, ...patch } : m)));
  }
  async function search(m: Match): Promise<Match> {
    const data = await result(
      await fetch("/api/v1/titles?type=movie&query=" + encodeURIComponent(m.query), { cache: "no-store" }),
    );
    const candidates: Film[] = data.items;
    const exact = candidates.filter(
      (f) =>
        /^\d{4}$/.test(m.year) && f.year === m.year && [f.name, f.original].some((n) => normal(n) === normal(m.name)),
    );
    return {
      ...m,
      candidates,
      needsSearch: false,
      selected: exact.length === 1 ? exact[0].id : "",
      status: exact.length === 1 ? "Correspondência por título e ano" : "Revise ou deixe de fora",
    };
  }
  async function upload(file: File) {
    if (file.size > 10_000_000) {
      setError("Envie um ZIP de até 10 MB.");
      return;
    }
    setFileName(file.name);
    setBusy(true);
    setError("");
    setComplete(false);
    setRows([]);
    setMatches([]);
    setDates({});
    setPrivacy([]);
    setAllowPublic({});
    processed.current.clear();
    stopped.current = false;
    try {
      const form = new FormData();
      form.set("file", file);
      setProgress("Lendo o ZIP…");
      const data = await result(await fetch("/api/importar/letterboxd/preview", { method: "POST", body: form }));
      const parsed = data.rows as Row[];
      setRows(parsed);
      setWarnings([...data.warnings, data.note]);
      const unique = [
        ...new Map(
          parsed.map((r) => [
            key(r),
            {
              key: key(r),
              name: r.name,
              year: r.year,
              query: r.name,
              candidates: [],
              selected: "",
              status: "Aguardando busca",
              needsSearch: true,
            } as Match,
          ]),
        ).values(),
      ];
      setMatches(unique);
      await findPending(unique);
      setProgress(
        stopped.current
          ? "Busca pausada. Use Verificar e importar faltantes para continuar."
          : "Prévia pronta. Revise as correspondências ou importe os registros confirmados.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function findPending(source: Match[]) {
    const resolved = new Map(source.map((m) => [m.key, m]));
    const queue = source.filter((m) => m.needsSearch);
    let next = 0,
      finished = 0;
    setSearching(true);
    async function worker() {
      while (!stopped.current && next < queue.length) {
        const m = queue[next++];
        let found: Match;
        try {
          found = await search(m);
        } catch {
          found = { ...m, status: "Busca indisponível. Tente novamente.", needsSearch: true };
        }
        resolved.set(m.key, found);
        update(m.key, found);
        setProgress(`Buscando filmes: ${++finished} de ${queue.length}.`);
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    } finally {
      setSearching(false);
    }
    return resolved;
  }
  async function commit() {
    setBusy(true);
    setError("");
    stopped.current = false;
    try {
      const resolved = await findPending(matches);
      if (stopped.current) {
        setProgress("Busca pausada. As escolhas foram mantidas.");
        return;
      }
      const chosen: { index: number; row: Row }[] = [];
      let ignored = 0;
      const occurrences = new Map<string, number>();
      const group = (title: string, date: string) => title + "|" + date;
      for (const record of processed.current.values()) {
        if (record.occurrence)
          occurrences.set(
            group(record.title, record.date),
            Math.max(occurrences.get(group(record.title, record.date)) ?? 0, record.occurrence),
          );
      }
      for (const [index, original] of rows.entries()) {
        if (processed.current.has(index)) continue;
        const match = resolved.get(key(original));
        if (match?.selected === "ignore") {
          ignored++;
          continue;
        }
        if (!match?.selected) continue;
        const row = { ...original, title: match.selected, date: original.date || dates[index] || "" };
        if (row.kind === "diary") {
          if (!row.date) continue;
          const k = group(row.title, row.date);
          row.occurrence = (occurrences.get(k) ?? 0) + 1;
          occurrences.set(k, row.occurrence);
        }
        chosen.push({ index, row });
      }
      for (let i = 0; i < chosen.length; i += 30) {
        const batch = chosen.slice(i, i + 30);
        setProgress(`Verificando registros: ${i + 1}–${i + batch.length} de ${chosen.length}.`);
        const data = await result(
          await fetch("/api/importar/letterboxd/commit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rows: batch.map((item) => item.row),
              keepPublic: batch.flatMap((item, j) => (allowPublic[item.index] === item.row.title ? [j] : [])),
            }),
          }),
        );
        const pending = new Set<number>(data.pending);
        const added = new Set<number>(data.added);
        const deferred = new Set<number>(data.deferred);
        setPrivacy((previous) => [
          ...new Set([...previous, ...batch.filter((_, j) => pending.has(j)).map((item) => item.index)]),
        ]);
        batch.forEach(({ index, row }, j) => {
          if (!pending.has(j) && !deferred.has(j))
            processed.current.set(index, {
              added: added.has(j),
              title: row.title!,
              date: row.date,
              occurrence: row.kind === "diary" ? row.occurrence : 0,
            });
        });
      }
      const added = [...processed.current.values()].filter((record) => record.added).length;
      const preserved = processed.current.size - added,
        pending = rows.length - processed.current.size - ignored;
      setProgress(
        `Adicionados: ${added}. Preservados: ${preserved}. Pendentes de revisão: ${pending}.` +
          (ignored ? ` Ignorados: ${ignored}.` : ""),
      );
      setComplete(pending === 0);
    } catch (e) {
      setError((e as Error).message + " Os lotes concluídos foram mantidos. Use o mesmo botão para continuar.");
    } finally {
      setBusy(false);
    }
  }
  const locked = new Set(rows.flatMap((row, i) => (processed.current.has(i) ? [key(row)] : [])));
  const matchByKey = new Map(matches.map((m) => [m.key, m]));
  const ignoredKeys = new Set(matches.filter((m) => m.selected === "ignore").map((m) => m.key));
  const selected = matches.filter((m) => m.selected && m.selected !== "ignore").length;
  return (
    <main className="wrap import-page">
      <header className="room-header">
        <Link href="/" className="account-brand">
          Cena Aberta
        </Link>
        <Link href="/?aba=profile" className="room-nav-button">
          Meu perfil
        </Link>
      </header>
      <div className="import-hero">
        <span className="room-eyebrow">SEU HISTÓRICO, UM NOVO CAPÍTULO</span>
        <div className="import-brand-symbol" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>→</span>
          <b>CA</b>
        </div>
        <h1>Seu cinema vem com você.</h1>
        <p>Traga seus filmes do Letterboxd e continue sua história no Cena Aberta.</p>
        <ol className="import-steps" aria-label="Etapas da importação">
          <li className={!rows.length ? "current" : "done"}>
            1 <span>Enviar ZIP</span>
          </li>
          <li className={rows.length && !complete ? "current" : ""}>
            2 <span>Revisar filmes</span>
          </li>
          <li className={complete ? "current" : ""}>
            3 <span>Concluir</span>
          </li>
        </ol>
      </div>
      <section className="panel">
        <h2>1. Escolha seu arquivo</h2>
        <p>
          Exporte sua conta no{" "}
          <a href="https://letterboxd.com/user/exportdata/" target="_blank" rel="noreferrer">
            Letterboxd
          </a>{" "}
          e envie o ZIP. Até 10 MB e 2000 registros.
        </p>
        <label className={"import-upload " + (busy ? "disabled" : "")}>
          <svg
            viewBox="0 0 24 24"
            width="36"
            height="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
          </svg>
          <strong>{fileName || "Escolher arquivo ZIP"}</strong>
          <span>{fileName ? "Clique para trocar o arquivo" : "Selecione o arquivo exportado pelo Letterboxd"}</span>
          <input
            aria-label="Arquivo ZIP"
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <small>ZIP · até 10 MB · até 2.000 registros</small>
        </label>
        <p className="muted">
          Aceita assistidos, <strong className="profile-section-name">Vou ver</strong>, notas, resenhas e{" "}
          <strong className="profile-section-name">Diário</strong>. Notas e resenhas existentes são preservadas; novas
          avaliações importadas ficam privadas. Formatação HTML vira texto. O ZIP não fica armazenado.
        </p>
      </section>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {progress && (
        <p role="status" className="message">
          {progress}
        </p>
      )}
      {searching && (
        <button
          onClick={() => {
            stopped.current = true;
          }}
        >
          Pausar buscas
        </button>
      )}
      {!!warnings.length && (
        <details className="panel">
          <summary>Avisos da importação ({warnings.length})</summary>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {!!matches.length && !complete && (
        <section className="panel">
          <h2>2. Revise os filmes</h2>
          <div className="import-stats">
            <div>
              <strong>{selected}</strong>
              <span>selecionados</span>
            </div>
            <div>
              <strong>{matches.length - selected - ignoredKeys.size}</strong>
              <span>para revisar</span>
            </div>
            <div>
              <strong>{rows.length}</strong>
              <span>registros no ZIP</span>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Mostrar
            apenas os não selecionados
          </label>
          <p className="muted">
            Confira especialmente remakes e títulos traduzidos. Você pode alterar o texto e buscar novamente.
          </p>
          <button className="primary" disabled={busy} onClick={() => void commit()}>
            {busy ? "Aguarde…" : "Verificar e importar faltantes"}
          </button>
          <div className="import-matches">
            {matches
              .filter((m) => !onlyPending || !m.selected)
              .map((m) => (
                <article key={m.key} className="import-row">
                  <div className="import-film-heading">
                    {m.candidates.find((f) => f.id === m.selected)?.poster ? (
                      <img
                        src={m.candidates.find((f) => f.id === m.selected)!.poster!}
                        alt={"Pôster de " + m.name}
                        loading="lazy"
                      />
                    ) : (
                      <span className="import-poster-placeholder" aria-hidden="true">
                        ◈
                      </span>
                    )}
                    <div>
                      <strong>{m.name}</strong>
                      <span className="muted"> {m.year}</span>
                      <small className={m.selected ? "import-match-ok" : "import-match-pending"}>
                        {m.selected === "ignore" ? "" : m.selected ? "Selecionado · " : "Revisar · "}
                        {m.status}
                      </small>
                    </div>
                  </div>
                  <div className="import-search">
                    <input
                      aria-label={"Buscar " + m.name}
                      value={m.query}
                      maxLength={100}
                      disabled={busy || locked.has(m.key)}
                      onChange={(e) =>
                        update(m.key, {
                          query: e.target.value,
                          needsSearch: true,
                          selected: "",
                          status: "Aguardando busca",
                        })
                      }
                    />
                    <button
                      disabled={busy || locked.has(m.key)}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          update(m.key, await search(m));
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Buscar
                    </button>
                  </div>
                  <label>
                    Filme no Cena Aberta
                    <select
                      disabled={busy || locked.has(m.key)}
                      value={m.selected}
                      onChange={(e) =>
                        update(m.key, {
                          selected: e.target.value,
                          needsSearch: false,
                          status: e.target.value === "ignore" ? "Ignorado" : "Escolha manual",
                        })
                      }
                    >
                      <option value="">Escolha o filme</option>
                      <option value="ignore">Não importar este filme</option>
                      {m.candidates.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.year}) · {f.original}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
          </div>
          <details className="panel">
            <summary>Ver notas, resenhas e datas do arquivo</summary>
            {rows.map((r, i) => (
              <div className="record" key={i}>
                <strong>{r.name}</strong> · {r.kind}
                {r.rating !== null && " · " + r.rating / 2 + "/5"}
                {r.date && " · " + r.date}
                {r.review && <p className="review-text">{r.review}</p>}
              </div>
            ))}
          </details>
          {rows.map(
            (r, i) =>
              !processed.current.has(i) &&
              !ignoredKeys.has(key(r)) &&
              (r.kind === "diary" && !r.date ? (
                <label key={i}>
                  Data da sessão de {r.name} (registro {i + 1}){" "}
                  <input
                    type="date"
                    disabled={busy}
                    value={dates[i] ?? ""}
                    onChange={(e) => setDates({ ...dates, [i]: e.target.value })}
                  />
                </label>
              ) : null),
          )}
          {privacy
            .filter((i) => !processed.current.has(i) && !ignoredKeys.has(key(rows[i])))
            .map((i) => (
              <label className="check" key={i}>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={!!allowPublic[i] && allowPublic[i] === matchByKey.get(key(rows[i]))?.selected}
                  onChange={(e) =>
                    setAllowPublic({
                      ...allowPublic,
                      [i]: e.target.checked ? (matchByKey.get(key(rows[i]))?.selected ?? "") : "",
                    })
                  }
                />{" "}
                Adicionar o que falta à avaliação pública de {rows[i].name}, mantendo a visibilidade pública.
              </label>
            ))}
        </section>
      )}
      {complete && (
        <section className="panel">
          <h2>Importação concluída</h2>
          <Link href="/?aba=profile" className="room-nav-button">
            Ver meu perfil
          </Link>
        </section>
      )}
    </main>
  );
}
