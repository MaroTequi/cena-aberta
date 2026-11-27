// Monta a consulta de `library-page` com os parâmetros novos `sort` e `filter` (contrato, seção 5).
export type LibrarySection = "watchlist" | "watched";
export type Option = { value: string; label: string };

const sorts: Option[] = [
  { value: "title", label: "Padrão" },
  { value: "recent", label: "Vistos recentemente" },
  { value: "rating", label: "Maior nota" },
  { value: "name", label: "Nome (A–Z)" },
  { value: "year", label: "Lançamento mais novo" },
];
const formats: Option[] = [
  { value: "movie", label: "Filmes" },
  { value: "tv", label: "Séries" },
  { value: "anime", label: "Animes" },
];
const ratingFilters: Option[] = [
  { value: "rated", label: "Com nota" },
  { value: "unrated", label: "Sem nota" },
  { value: "min:6", label: "3★ ou mais" },
  { value: "min:8", label: "4★ ou mais" },
  { value: "min:9", label: "4,5★ ou mais" },
  { value: "min:10", label: "Só 5★" },
];

/**
 * Ordenações que fazem sentido para a seção.
 * @param section `watchlist` (Vou ver) ou `watched` (Já vistos)
 * @param diaryVisible se as datas do diário podem ordenar (dono, ou visitante com diário público)
 * @returns opções para o seletor; `recent` e `rating` ficam fora do Vou ver
 */
export function sortOptions(section: LibrarySection, diaryVisible: boolean): Option[] {
  return sorts
    .filter((o) => section === "watched" || (o.value !== "recent" && o.value !== "rating"))
    .filter((o) => o.value !== "recent" || diaryVisible);
}

/**
 * Filtros que fazem sentido para a seção (notas só nos Já vistos).
 * @param section seção da biblioteca
 * @returns opções para o seletor, começando por `all`
 */
export function filterOptions(section: LibrarySection): Option[] {
  return [{ value: "all", label: "Tudo" }, ...formats, ...(section === "watched" ? ratingFilters : [])];
}

/**
 * Parâmetros de `library-page`. Valores padrão e combinações que a seção não aceita ficam de fora,
 * para a resposta continuar idêntica à antiga quando nada foi escolhido.
 * @returns a query pronta para `"library-page?" + params`
 */
export function libraryParams(input: {
  section: LibrarySection;
  page: number;
  username?: string;
  sort?: string;
  filter?: string;
  diaryVisible?: boolean;
}): URLSearchParams {
  const params = new URLSearchParams({ section: input.section, page: String(input.page) });
  if (input.username) params.set("username", input.username);
  const sort = input.sort ?? "title";
  if (sort !== "title" && sortOptions(input.section, input.diaryVisible ?? true).some((o) => o.value === sort))
    params.set("sort", sort);
  const filter = input.filter ?? "all";
  if (filter !== "all" && filterOptions(input.section).some((o) => o.value === filter)) params.set("filter", filter);
  return params;
}
