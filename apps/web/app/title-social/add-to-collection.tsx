"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/client-api";
import { addTitle } from "../../lib/collection-items";
import type { CollectionSummary } from "../colecoes/collection-cover";
import { UiIcon } from "../ui-icons";

type Detail = { id: string; name: string; version: number; items: { title: string; position: number }[] };

/**
 * Acrescenta a obra no fim da coleção. Em conflito de versão (409) relê a coleção e tenta mais uma vez.
 * @returns `true` se adicionou, `false` se a obra já estava lá
 */
async function appendTo(collection: string, title: string): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const detail = await api<Detail>("me/collections/" + collection);
    const titles = [...detail.items].sort((a, b) => a.position - b.position).map((item) => item.title);
    if (titles.includes(title)) return false;
    try {
      await api("me/collections/" + collection + "/items", "PUT", {
        version: detail.version,
        titles: addTitle(titles, title),
      });
      return true;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 409 || attempt > 0) throw e;
    }
  }
}

/** Conteúdo do diálogo, montado só quando aberto para buscar as coleções na hora. */
function CollectionPicker({ titleId, name }: { titleId: string; name: string }) {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null),
    [added, setAdded] = useState<Set<string>>(new Set()),
    [newName, setNewName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const createKey = useRef<{ name: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    api<{ items: (CollectionSummary & { has: boolean })[] }>("me/collections?title=" + encodeURIComponent(titleId))
      .then((data) => {
        if (!active) return;
        setCollections(data.items);
        setAdded(new Set(data.items.filter((c) => c.has).map((c) => c.id)));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [titleId]);
  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setNotice(await work());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function add(collection: CollectionSummary) {
    void run(async () => {
      const done = await appendTo(collection.id, titleId);
      setAdded((old) => new Set(old).add(collection.id));
      if (done)
        setCollections((old) => old?.map((c) => (c.id === collection.id ? { ...c, count: c.count + 1 } : c)) ?? null);
      return done ? name + " entrou em “" + collection.name + "”." : name + " já estava em “" + collection.name + "”.";
    });
  }
  function create(event: FormEvent) {
    event.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    // Mesma chave enquanto o nome não mudar: repetir após uma falha não cria duas coleções.
    if (createKey.current?.name !== trimmed) createKey.current = { name: trimmed, key: crypto.randomUUID() };
    const key = createKey.current.key;
    void run(async () => {
      const created = await api<Detail>("me/collections", "POST", { name: trimmed, description: "" }, key);
      createKey.current = null;
      await appendTo(created.id, titleId);
      setCollections((old) => [
        { id: created.id, name: created.name, description: "", version: 1, count: 1, titles: [titleId] },
        ...(old ?? []),
      ]);
      setAdded((old) => new Set(old).add(created.id));
      setNewName("");
      return "Coleção “" + created.name + "” criada com " + name + ".";
    });
  }
  return (
    <>
      {!collections && !error && <p role="status">Carregando coleções…</p>}
      {collections && !collections.length && (
        <p className="muted">Você ainda não tem coleções. Crie a primeira abaixo.</p>
      )}
      {collections && collections.length > 0 && (
        <ul className="picker-list">
          {collections.map((collection) => (
            <li key={collection.id}>
              <span>
                <strong>{collection.name}</strong>
                <small>{collection.count === 1 ? "1 obra" : collection.count + " obras"}</small>
              </span>
              {added.has(collection.id) ? (
                <Link className="small" href={"/colecoes/" + collection.id}>
                  Na coleção ✓
                </Link>
              ) : (
                <button type="button" disabled={busy} onClick={() => add(collection)}>
                  Adicionar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="picker-create" onSubmit={create}>
        <label>
          Nova coleção
          <input
            value={newName}
            maxLength={100}
            placeholder="Nome da coleção"
            onChange={(e) => setNewName(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy || !newName.trim()}>
          Criar e adicionar
        </button>
      </form>
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
    </>
  );
}

/**
 * Botão "Adicionar à coleção" da página da obra, com diálogo para escolher ou criar a coleção.
 * @param titleId id da obra
 * @param name nome da obra para as mensagens
 */
export function AddToCollection({ titleId, name }: { titleId: string; name: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        <UiIcon name="list" /> Adicionar à coleção
      </button>
      <dialog
        ref={dialog}
        className="session-dialog picker-dialog"
        aria-labelledby="collection-picker-heading"
        onClose={() => setOpen(false)}
      >
        <header className="section-heading">
          <h2 id="collection-picker-heading">Adicionar à coleção</h2>
          <button type="button" autoFocus onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        {open && <CollectionPicker titleId={titleId} name={name} />}
      </dialog>
    </>
  );
}
