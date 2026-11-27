"use client";
import { useRef, useState } from "react";
import { api } from "../lib/client-api";
import type { SpoilerState } from "../lib/dashboard-types";
import { IconAction } from "./action-icons";
import { Spoiler } from "./title-parts";
import { UiIcon } from "./ui-icons";
import { ReviewReport } from "./review-report";

export function ReviewReader({
  name,
  titleId,
  author,
  own,
  watched,
  text,
  version,
  initial,
}: {
  name?: string;
  titleId: string;
  author: string;
  own: boolean;
  watched: boolean;
  text: string;
  version: number;
  initial: SpoilerState;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reading, setReading] = useState(false);
  const [state, setState] = useState(initial);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function vote(value: boolean) {
    if (saving || state.my_vote === value) return;
    setSaving(true);
    setError("");
    try {
      setState(
        await api<SpoilerState>("titles/" + titleId + "/spoiler-vote", "PUT", {
          username: author,
          version,
          containsSpoiler: value,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const review = <Spoiler hidden={!own && !watched && state.spoiler}>{text}</Spoiler>;
  const votes = (
    <>
      {!own && (
        <div className="spoiler-votes" role="group" aria-label="Votar sobre spoiler na resenha">
          {[true, false].map((value) => {
            const label = value ? "Contém spoiler" : "Não contém spoiler";
            return (
              <IconAction
                key={String(value)}
                kind="spoiler"
                iconActive={value}
                active={state.my_vote === value}
                label={label}
                disabled={saving}
                onClick={() => void vote(value)}
              />
            );
          })}
        </div>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
    </>
  );
  const report = !own && <ReviewReport title={titleId} username={author} version={version} />;
  if (!name)
    return (
      <>
        {votes}
        {review}
        {report}
      </>
    );
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={"Abrir resenha de " + name}
        title="Abrir resenha"
        onClick={() => {
          setReading(true);
          dialog.current?.showModal();
        }}
      >
        <UiIcon name="review" />
      </button>
      <dialog
        ref={dialog}
        className="session-dialog profile-review-dialog"
        aria-label={"Resenha de " + name}
        onClose={() => setReading(false)}
      >
        <h2>Resenha de {name}</h2>
        {reading && (
          <>
            {review}
            {votes}
            {report}
          </>
        )}
        <form method="dialog" className="row">
          <button>Fechar</button>
        </form>
      </dialog>
    </>
  );
}
