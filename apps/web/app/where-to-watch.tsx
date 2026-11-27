"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "../lib/client-api";
import { availabilityGroups, includedInSubscriptions, type Availability } from "../lib/streaming";
import { ProviderLogo } from "./provider-logo";

/**
 * Seção "Onde assistir" da página da obra: serviços do Brasil por assinatura, grátis, aluguel e
 * compra, destacando os que a pessoa assina. Os dados vêm da JustWatch pelo TMDB, e o crédito é obrigatório.
 * @param titleId id do filme ou da série
 * @param signedIn se há sessão (só então consulta os serviços que a pessoa assina)
 */
export function WhereToWatch({ titleId, signedIn }: { titleId: string; signedIn: boolean }) {
  const [availability, setAvailability] = useState<Availability | null>(null),
    [subscribed, setSubscribed] = useState<number[] | null>(null),
    [error, setError] = useState(""),
    [attempt, retry] = useState(0);
  useEffect(() => {
    let active = true;
    const mine = signedIn
      ? api<{ providers: number[] }>("me/providers").then(
          (data) => data.providers,
          () => null,
        )
      : Promise.resolve(null);
    Promise.all([api<Availability>("titles/" + titleId + "/providers"), mine])
      .then(([found, providers]) => {
        if (!active) return;
        setAvailability(found);
        setSubscribed(providers);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [titleId, signedIn, attempt]);
  const groups = availability ? availabilityGroups(availability, subscribed ?? []) : [];
  const included = !!availability && includedInSubscriptions(availability, subscribed ?? []);
  return (
    <section className="community where-to-watch" aria-labelledby="where-to-watch-heading">
      <h3 id="where-to-watch-heading">Onde assistir</h3>
      {!availability && !error && <p role="status">Procurando onde assistir…</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              retry((n) => n + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      {availability && !groups.length && (
        <p className="muted">Não encontramos esta obra em serviços disponíveis no Brasil.</p>
      )}
      {included && <p className="where-to-watch-included">Incluída em um serviço que você assina.</p>}
      {groups.map((group) => (
        <div className="where-to-watch-group" key={group.key}>
          <h4>{group.label}</h4>
          <ul>
            {group.providers.map((provider) => (
              <li key={provider.id} className={provider.subscribed ? "provider-chip provider-mine" : "provider-chip"}>
                <ProviderLogo provider={provider} />
                <span>{provider.name}</span>
                {provider.subscribed && <span className="friend-badge">Você assina</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {availability && groups.length > 0 && (
        <p className="where-to-watch-credit">
          {availability.link && (
            <>
              <a href={availability.link} target="_blank" rel="noreferrer">
                Abrir os links de cada serviço
              </a>{" "}
              ·{" "}
            </>
          )}
          Disponibilidade no Brasil fornecida pela{" "}
          <a href="https://www.justwatch.com/br" target="_blank" rel="noreferrer">
            JustWatch
          </a>
          .
        </p>
      )}
      {signedIn && availability && subscribed !== null && !subscribed.length && (
        <p className="muted">
          <Link href="/conta/configuracoes#streamings">Marque os streamings que você assina</Link> para destacá-los aqui
          e filtrar as salas.
        </p>
      )}
    </section>
  );
}
