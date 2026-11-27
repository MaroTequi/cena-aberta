"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../lib/client-api";
import { UserPageHeader, useTitles } from "../user-pages";
import { UiIcon } from "../ui-icons";
import { CollectionCard, type CollectionSummary } from "./collection-cover";

type Detail = { id: string };

/** Página `/colecoes`: lista, cria e exclui as coleções do usuário. */
export function CollectionsPage() {
  const router = useRouter();
  const [items, setItems] = useState<CollectionSummary[] | null>(null),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, retry] = useState(0);
  // Reaproveita a mesma Idempotency-Key se o envio do mesmo formulário for repetido após uma falha.
  const pendingKeys = useRef(new Map<string, string>());
  const known = useTitles((items ?? []).flatMap((c) => c.titles));
  useEffect(() => {
    let active = true;
    api<{ items: CollectionSummary[] }>("me/collections")
      .then((data) => {
        if (active) setItems(data.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const body = { name: name.trim(), description: description.trim() };
    const fingerprint = JSON.stringify(body);
    const key = pendingKeys.current.get(fingerprint) ?? crypto.randomUUID();
    pendingKeys.current.set(fingerprint, key);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const created = await api<Detail>("me/collections", "POST", body, key);
      pendingKeys.current.delete(fingerprint);
      router.push("/colecoes/" + created.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function remove(collection: CollectionSummary) {
    if (busy || !window.confirm("Excluir a coleção “" + collection.name + "”? As obras continuam na sua biblioteca."))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("me/collections/" + collection.id, "DELETE");
      setItems((old) => old?.filter((c) => c.id !== collection.id) ?? null);
      setNotice("Coleção excluída.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <UserPageHeader current="/colecoes" />
      <main className="wrap friends-page collections-page">
        <div className="room-intro">
          <span className="room-eyebrow">SUAS LISTAS, DO SEU JEITO</span>
          <h1>Coleções</h1>
          <p>Junte obras por tema, clima ou maratona. A ordem é você quem escolhe.</p>
        </div>
        <section className="panel">
          <h2>Nova coleção</h2>
          <form className="form" onSubmit={create}>
            <label>
              Nome
              <input
                value={name}
                required
                maxLength={100}
                placeholder="Ex.: Para ver no domingo"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Descrição (opcional)
              <textarea value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="row">
              <button className="primary" disabled={busy || !name.trim()}>
                Criar coleção
              </button>
            </div>
          </form>
        </section>
        {error && (
          <p role="alert" className="message error">
            {error}{" "}
            {!items && (
              <button
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
        {notice && (
          <p role="status" className="message">
            {notice}
          </p>
        )}
        <section className="panel" aria-busy={!items}>
          <h2>Minhas coleções {items && <span className="friend-count">{items.length}</span>}</h2>
          {!items && !error && <p role="status">Carregando coleções…</p>}
          {items && !items.length && <p className="muted">Você ainda não criou nenhuma coleção.</p>}
          <div className="collection-grid">
            {items?.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} known={known}>
                <button
                  type="button"
                  className="collection-delete"
                  disabled={busy}
                  aria-label={"Excluir a coleção " + collection.name}
                  title="Excluir coleção"
                  onClick={() => void remove(collection)}
                >
                  <UiIcon name="trash" />
                </button>
              </CollectionCard>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
