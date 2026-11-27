import "server-only";

export type TimelineEntry = {
  key: string;
  work: string | null;
  title: string;
  date: string;
  kind: string;
  continuity?: boolean;
  poster?: string | null;
};
type Binding = { value: string };
type RelatedRow = {
  other: Binding;
  otherLabel: Binding;
  movie?: Binding;
  tv?: Binding;
  first?: Binding;
  rel: Binding;
  inverse: Binding;
  ova: Binding;
};
const cache = { revalidate: 86400 };

async function catalogTimeline(id: string): Promise<TimelineEntry[]> {
  const response = await fetch((process.env.CATALOG_URL ?? "http://127.0.0.1:8181") + "/chronology/" + id, {
    headers: { "X-Internal-Key": process.env.CATALOG_INTERNAL_SECRET ?? "" },
    next: cache,
    signal: AbortSignal.timeout(11000),
  });
  if (!response.ok) throw new Error("Catálogo indisponível");
  return response.json();
}

async function related(id: string): Promise<TimelineEntry[]> {
  const [, format, number] = id.split("-");
  const query = `SELECT ?other ?otherLabel ?movie ?tv ?rel ?inverse ?ova (MIN(?published) AS ?first) WHERE {
    ?anchor wdt:${format === "movie" ? "P4947" : "P4983"} "${number}" .
    {
      { ?anchor ?rel ?other . BIND(false AS ?inverse) } UNION { ?other ?rel ?anchor . BIND(true AS ?inverse) }
      VALUES ?rel { wdt:P155 wdt:P156 wdt:P2512 wdt:P4969 }
    } UNION {
      ?anchor wdt:P179 ?series . ?other wdt:P179 ?series .
      FILTER(?other != ?anchor)
      BIND(wdt:P179 AS ?rel) BIND(false AS ?inverse)
    }
    BIND(EXISTS { ?other wdt:P31 wd:Q220898 } AS ?ova)
    FILTER(?rel != wdt:P4969 || ?ova)
    OPTIONAL { ?other wdt:P4947 ?movie } OPTIONAL { ?other wdt:P4983 ?tv }
    FILTER(BOUND(?movie) || BOUND(?tv) || ?ova)
    OPTIONAL { ?other wdt:P577 ?published }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en" }
  } GROUP BY ?other ?otherLabel ?movie ?tv ?rel ?inverse ?ova LIMIT 150`;
  const response = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "CenaAberta/1.0 (https://github.com/MaroTequi/cena-aberta)",
    },
    next: cache,
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error("Relações indisponíveis");
  const data = (await response.json()) as { results: { bindings: RelatedRow[] } };
  return data.results.bindings.flatMap((row) => {
    const movie = row.movie?.value,
      tv = row.tv?.value;
    const work =
      movie && /^[1-9]\d*$/.test(movie) ? "tmdb-movie-" + movie : tv && /^[1-9]\d*$/.test(tv) ? "tmdb-tv-" + tv : null;
    const title = row.otherLabel.value;
    if (work === id || !title || /^Q\d+$/.test(title)) return [];
    const rel = row.rel.value.split("/").pop(),
      inverse = row.inverse.value === "true";
    const kind =
      row.ova.value === "true"
        ? "OVA"
        : rel === "P179"
          ? "Mesma série de obras"
          : rel === "P2512"
            ? inverse
              ? "Obra de origem"
              : "Spin-off"
            : (rel === "P155") !== inverse
              ? "Obra anterior"
              : "Sequência";
    return [
      {
        key: work ?? row.other.value,
        work,
        title,
        date: row.first?.value.slice(0, 10) ?? "",
        kind,
        continuity: rel === "P155" || rel === "P156",
      },
    ];
  });
}

export async function chronologyPosters(items: TimelineEntry[]) {
  const posters = new Map<string, string>();
  for (const item of items) if (item.poster) posters.set(item.key, item.poster);
  const missing = [...new Set(items.flatMap((item) => (item.work && !posters.has(item.work) ? [item.work] : [])))];
  for (let start = 0; start < missing.length; start += 30) {
    const ids = missing.slice(start, start + 30);
    try {
      const response = await fetch(
        (process.env.CATALOG_URL ?? "http://127.0.0.1:8181") + "/title-batch?ids=" + ids.join(","),
        {
          headers: { "X-Internal-Key": process.env.CATALOG_INTERNAL_SECRET ?? "" },
          next: cache,
          signal: AbortSignal.timeout(12000),
        },
      );
      if (response.ok)
        for (const title of (await response.json()) as { id: string; poster: string | null }[]) {
          if (title.poster) posters.set(title.id, title.poster);
        }
    } catch {
      /* Os títulos continuam acessíveis quando a consulta das capas falha. */
    }
  }
  return posters;
}

export async function releaseTimeline(id: string) {
  if (!/^tmdb-(movie|tv)-[1-9]\d{0,12}$/.test(id)) return { entries: [], partial: false };
  const [catalog, relations] = await Promise.allSettled([catalogTimeline(id), related(id)]);
  const entries = new Map<string, TimelineEntry>();
  if (catalog.status === "fulfilled")
    for (const entry of catalog.value) {
      entries.set(entry.key, entry.kind === "Filme da coleção" ? { ...entry, continuity: true } : entry);
    }
  if (relations.status === "fulfilled")
    for (const entry of relations.value) {
      const stored = entries.get(entry.key);
      if (stored && (stored.continuity || entry.kind === "Mesma série de obras")) continue;
      entries.set(
        entry.key,
        stored ? { ...stored, continuity: entry.continuity, kind: entry.kind, date: stored.date || entry.date } : entry,
      );
    }
  return {
    entries: [...entries.values()].sort(
      (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, "pt-BR"),
    ),
    partial: catalog.status === "rejected" || relations.status === "rejected",
  };
}
