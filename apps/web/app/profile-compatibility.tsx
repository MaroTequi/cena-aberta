"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/client-api";
import { agreementLabel } from "../lib/social-format";
import { toStars } from "../lib/stats";
import { TitleCard, useTitles } from "./user-pages";

type Pair = { title: string; mine: number; theirs: number };
type Compatibility = { username: string; shared: number; agreement: number | null; agree: Pair[]; disagree: Pair[] };

/**
 * Bloco "Compatibilidade" no perfil de um amigo: quanto as notas dos dois concordam.
 * Não aparece para quem não é amigo (a API responde 403).
 * @param username perfil visitado
 * @param name nome para exibir
 */
export function ProfileCompatibility({ username, name }: { username: string; name: string }) {
  const [data, setData] = useState<Compatibility | null>(null);
  const known = useTitles(data ? [...data.agree, ...data.disagree].map((pair) => pair.title) : []);
  useEffect(() => {
    let active = true;
    api<Compatibility>("friends/compatibility?username=" + encodeURIComponent(username))
      .then((value) => {
        if (active) setData(value);
      })
      .catch(() => {
        // Sem amizade (403), o próprio perfil (400) ou falha: o bloco é opcional e simplesmente não aparece.
      });
    return () => {
      active = false;
    };
  }, [username]);
  if (!data || data.username !== username) return null;
  function pairs(list: Pair[], heading: string) {
    if (!list.length) return null;
    return (
      <div>
        <h3>{heading}</h3>
        <div className="grid compatibility-grid">
          {list.map((pair) => (
            <TitleCard key={pair.title} id={pair.title} title={known[pair.title]}>
              <small className="compatibility-scores">
                Você ★ {toStars(pair.mine)} · {name} ★ {toStars(pair.theirs)}
              </small>
            </TitleCard>
          ))}
        </div>
      </div>
    );
  }
  return (
    <section className="panel compatibility" aria-labelledby="compatibility-heading">
      <h2 id="compatibility-heading">Compatibilidade</h2>
      {data.agreement === null ? (
        <p className="muted">
          {data.shared === 0
            ? "Vocês ainda não deram nota para as mesmas obras."
            : data.shared === 1
              ? "Vocês deram nota para 1 obra em comum."
              : "Vocês deram nota para " + data.shared + " obras em comum."}{" "}
          A compatibilidade aparece a partir de 3 obras.
        </p>
      ) : (
        <div className="compatibility-score">
          <strong>{data.agreement}%</strong>
          <span>
            Vocês concordam em {data.agreement}% · {agreementLabel(data.agreement)}
            <small>Com base em {data.shared} obras que os dois avaliaram.</small>
          </span>
        </div>
      )}
      {pairs(data.agree, "Onde vocês concordam")}
      {pairs(data.disagree, "Onde vocês discordam")}
    </section>
  );
}
