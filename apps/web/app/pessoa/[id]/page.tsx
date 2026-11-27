import { UserPageHeader } from "../../user-pages";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "../../../lib/auth";
import { requireProfile } from "../../../lib/profile";
import { Poster } from "../../poster";
import { Portrait, roleLabel } from "../../work-people";

export const metadata = { title: "Pessoa · Cena Aberta" };
type Work = { id: string; title: string; date: string; poster: string | null; roles: string[] };
type Person = {
  name: string;
  photo: string | null;
  biography: string;
  birthday: string;
  deathday: string;
  birthplace: string;
  works: Work[];
};
function displayDate(value: string) {
  return value.split("-").reverse().join("/");
}
export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ obra?: string }>;
}) {
  const session = (await getServerSession(authOptions)) as { actor?: string } | null;
  if (!session?.actor) redirect("/conta");
  await requireProfile(session.actor);
  const { id } = await params;
  if (!/^[1-9][0-9]{0,12}$/.test(id)) notFound();
  const { obra } = await searchParams;
  const back = obra && /^tmdb-(movie|tv)-[1-9][0-9]{0,12}$/.test(obra) ? "/obra/" + obra : "/";
  const response = await fetch((process.env.CATALOG_URL ?? "http://127.0.0.1:8181") + "/people/" + id, {
    headers: { "X-Internal-Key": process.env.CATALOG_INTERNAL_SECRET ?? "" },
    next: { revalidate: 21600 },
    signal: AbortSignal.timeout(6500),
  }).catch(() => null);
  if (response?.status === 404) notFound();
  const person: Person | null = response?.ok ? await response.json() : null;
  return (
    <>
      <UserPageHeader />
      <main className="wrap person-page">
        <a className="person-back" href={back}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m10 5-7 7 7 7M3 12h18" />
          </svg>
          Voltar
        </a>
        {!person ? (
          <p role="status">
            Não foi possível carregar a ficha desta pessoa.{" "}
            <a href={"?" + (back === "/" ? "" : "obra=" + obra)}>Tentar novamente</a>
          </p>
        ) : (
          <>
            <section className="person-intro">
              <Portrait name={person.name} photo={person.photo} />
              <div>
                <h1>{person.name}</h1>
                {person.birthday && <p>Nascimento · {displayDate(person.birthday)}</p>}
                {person.birthplace && <p>Local de nascimento · {person.birthplace}</p>}
                {person.deathday && <p>Falecimento · {displayDate(person.deathday)}</p>}
              </div>
            </section>
            {person.biography && (
              <section>
                <h2>Biografia</h2>
                <p className="person-bio">{person.biography}</p>
              </section>
            )}
            <section>
              <h2>Filmografia</h2>
              {person.works.length ? (
                <ul className="person-works">
                  {person.works.map((work) => (
                    <li key={work.id}>
                      <a className="person-work-link" href={"/obra/" + work.id}>
                        <div aria-hidden="true">
                          <Poster title={{ id: work.id, name: work.title, poster: work.poster }} />
                        </div>
                        <div>
                          <strong>{work.title}</strong>
                          <small>
                            {[
                              work.date.slice(0, 4),
                              work.id.startsWith("tmdb-tv") ? "Série" : "Filme",
                              ...work.roles.map(roleLabel),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum crédito de filme ou série disponível.</p>
              )}
            </section>
            <small>Dados e imagens: TMDB</small>
          </>
        )}
      </main>
    </>
  );
}
