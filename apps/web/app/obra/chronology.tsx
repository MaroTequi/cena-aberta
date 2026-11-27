import { UiIcon } from "../ui-icons";
import { Poster } from "../poster";
import { chronologyPosters, releaseTimeline, type TimelineEntry } from "../../lib/chronology";

// Filmes cobertos pela ordem cronológica do guia oficial. O ano é o da estreia.
const starWarsFilms: TimelineEntry[] = [
  [1893, "A Ameaça Fantasma", 1999],
  [1894, "Ataque dos Clones", 2002],
  [12180, "The Clone Wars", 2008],
  [1895, "A Vingança dos Sith", 2005],
  [348350, "Han Solo: Uma História Star Wars", 2018],
  [330459, "Rogue One: Uma História Star Wars", 2016],
  [11, "Uma Nova Esperança", 1977],
  [1891, "O Império Contra-Ataca", 1980],
  [1892, "O Retorno de Jedi", 1983],
  [1228710, "O Mandaloriano e Grogu", 2026],
  [140607, "O Despertar da Força", 2015],
  [181808, "Os Últimos Jedi", 2017],
  [181812, "A Ascensão Skywalker", 2019],
].map(([id, title, year]) => ({
  key: "tmdb-movie-" + id,
  work: "tmdb-movie-" + id,
  title: String(title),
  date: String(year),
  kind: "Filme",
}));

const skywalkerEpisodes = new Set(
  [1893, 1894, 1895, 11, 1891, 1892, 140607, 181808, 181812].map((id) => "tmdb-movie-" + id),
);
const guides = [
  {
    name: "Saga Skywalker",
    source: "Guia oficial de Star Wars",
    url: "https://www.starwars.com/news/star-wars-movies-and-series-guide",
    items: starWarsFilms.filter((work) => skywalkerEpisodes.has(work.key)),
  },
  {
    name: "Samurai X · série de 1996 e OVAs",
    source: "Sinopses da Aniplex",
    url: "https://aniplexusa.com/rurounikenshin/",
    items: [
      {
        key: "tmdb-tv-317885",
        work: "tmdb-tv-317885",
        title: "Samurai X: Trust & Betrayal",
        date: "1999",
        kind: "OVA · Prelúdio",
      },
      { key: "tmdb-tv-28136", work: "tmdb-tv-28136", title: "Samurai X", date: "1996", kind: "Série original" },
      {
        key: "tmdb-tv-313336",
        work: "tmdb-tv-313336",
        title: "Samurai X: Reflection",
        date: "2001",
        kind: "OVA · Epílogo",
      },
    ],
  },
];

function Entries({
  items,
  current,
  posters,
}: {
  items: TimelineEntry[];
  current: string;
  posters: Map<string, string>;
}) {
  const rows = (list: TimelineEntry[]) =>
    list.map((item) => {
      const active = item.work === current;
      const content = (
        <>
          <div className="timeline-cover" aria-hidden="true">
            <Poster title={{ id: item.key, name: item.title, poster: posters.get(item.key) ?? null }} />
          </div>
          <div>
            <strong>{item.title}</strong>
            {active && <small className="timeline-current">Você está aqui</small>}
            <small>
              {item.kind} ·{" "}
              {item.date
                ? item.date.length === 10
                  ? item.date.split("-").reverse().join("/")
                  : item.date
                : "Data desconhecida"}
            </small>
          </div>
        </>
      );
      return (
        <li key={item.key} aria-current={active ? "step" : undefined}>
          {item.work && !active ? (
            <a className="credit-card" href={"/obra/" + item.work}>
              {content}
            </a>
          ) : (
            <div className="credit-card">{content}</div>
          )}
        </li>
      );
    });
  return (
    <>
      <ol className="credit-grid timeline-list">{rows(items.slice(0, 10))}</ol>
      {items.length > 10 && (
        <details open={items.slice(10).some((item) => item.work === current) || undefined}>
          <summary>Ver mais {items.length - 10}</summary>
          <ol className="credit-grid timeline-list" start={11}>
            {rows(items.slice(10))}
          </ol>
        </details>
      )}
    </>
  );
}

export async function Chronology({ id }: { id: string }) {
  const guide = guides.find((g) => g.items.some((work) => work.key === id));
  const story = [...(guide?.items ?? [])].reverse();
  const { entries, partial } = await releaseTimeline(id);
  const known = new Set(story.map((item) => item.key));
  const main = entries.filter((item) => !known.has(item.key) && (item.continuity || item.key === id));
  const hasTimeline = story.length > 0 || main.some((item) => item.key !== id);
  const related = new Map(
    entries
      .filter((item) => item.key !== id && !known.has(item.key) && !item.continuity)
      .map((item) => [item.key, item]),
  );
  if (starWarsFilms.some((item) => item.key === id)) {
    for (const item of starWarsFilms) {
      if (
        item.key !== id &&
        !known.has(item.key) &&
        !entries.some((entry) => entry.key === item.key && entry.continuity) &&
        !related.has(item.key)
      )
        related.set(item.key, item);
    }
  }
  const others = [...related.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "pt-BR"),
  );
  if (!hasTimeline && !others.length)
    return partial ? <p className="muted">Não foi possível consultar todas as relações desta obra.</p> : null;
  const posters = await chronologyPosters([...entries, ...story, ...others]);
  return (
    <>
      {hasTimeline && (
        <details className="work-timeline">
          <summary>
            <UiIcon name="clock" />
            Cronologia
          </summary>
          {guide && (
            <>
              <h4>{guide.name} · Ordem da história</h4>
              <Entries items={story} current={id} posters={posters} />
              <a href={guide.url}>{guide.source}</a>
            </>
          )}
          {main.length > 0 && (
            <>
              <h4>Ordem de lançamento</h4>
              <Entries items={main} current={id} posters={posters} />
            </>
          )}
        </details>
      )}
      {others.length > 0 && (
        <details className="work-timeline">
          <summary>
            <UiIcon name="link" />
            Obras correlatas
          </summary>
          <Entries items={others} current={id} posters={posters} />
        </details>
      )}
      {partial && <small>Parte das fontes está indisponível.</small>}
    </>
  );
}
