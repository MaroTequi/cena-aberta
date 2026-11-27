/** Abas da busca central: tudo, cada tipo de obra e pessoas. */
export const searchTabs = [
  { id: "tudo", label: "Tudo" },
  { id: "filmes", label: "Filmes" },
  { id: "series", label: "Séries" },
  { id: "animes", label: "Animes" },
  { id: "pessoas", label: "Pessoas" },
] as const;

export type SearchTab = (typeof searchTabs)[number]["id"];

/** Tipo de obra do catálogo (`titles?type=`) de cada aba; pessoas não têm. */
export const titleTypeOf: Record<SearchTab, "all" | "movie" | "tv" | "anime" | null> = {
  tudo: "all",
  filmes: "movie",
  series: "tv",
  animes: "anime",
  pessoas: null,
};

/** Menor termo aceito pela busca (o catálogo recusa menos que isso para pessoas). */
export const MIN_SEARCH = 2;

/** Termo como vai para o catálogo: sem espaços nas pontas e com espaços repetidos trocados por um só. */
export function cleanTerm(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

/** Aba vinda da URL; qualquer valor desconhecido vira "tudo". */
export function parseTab(value: string | undefined | null): SearchTab {
  return searchTabs.some((tab) => tab.id === value) ? (value as SearchTab) : "tudo";
}

/** Endereço da busca com termo e aba, para compartilhar ou voltar pelo histórico. */
export function searchHref(query: string, tab: SearchTab) {
  const params = new URLSearchParams();
  const term = cleanTerm(query);
  if (term) params.set("q", term);
  if (tab !== "tudo") params.set("tipo", tab);
  const text = params.toString();
  return "/busca" + (text ? "?" + text : "");
}

const departments: Record<string, string> = {
  Acting: "Atuação",
  Directing: "Direção",
  Writing: "Roteiro",
  Production: "Produção",
  Creator: "Criação",
  Sound: "Som",
  Camera: "Fotografia",
  Editing: "Montagem",
  Art: "Arte",
  "Costume & Make-Up": "Figurino e maquiagem",
  "Visual Effects": "Efeitos visuais",
  Lighting: "Iluminação",
  Crew: "Equipe",
};

/** Área em que a pessoa é conhecida, em português ("" quando o TMDB não informa). */
export function departmentLabel(department: string) {
  return departments[department] ?? department;
}
