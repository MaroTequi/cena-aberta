export function workHref(id:string) {
  const episode=/^ep-((?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12}))-s(0|[1-9][0-9]{0,2}|1000)-e([1-9][0-9]{0,8})$/.exec(id);
  const season=/^season-(demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12})-s(0|[1-9][0-9]{0,2}|1000)$/.exec(id);
  if(season)return "/obra/"+season[1]+"/temporadas/"+season[2];
  return episode?"/obra/"+episode[1]+"/episodios/"+episode[2]+"/"+episode[3]:"/obra/"+encodeURIComponent(id);
}

export function workKind({anime,format}:{anime:boolean;format:string}) {
  if(format==="seas")return "Temporada";
  if(format==="ep")return "Episódio";
  if(anime)return "Anime";
  return format==="movie"?"Filme":"Série";
}

export function seasonName(number:number) {
  return number===0?"Especiais":"Temporada "+number;
}

export function seasonHref(seriesId:string,season:number) {
  return "/obra/"+encodeURIComponent(seriesId)+"/temporadas/"+season;
}

export const rankingGroups = [
  ["movie","Filmes"],
  ["tv","Séries"],
  ["ep","Episódios de séries"],
  ["anime","Animes"],
  ["anime-ep","Episódios de animes"],
] as const;

export function rankingGroup(work:{format:string;anime:boolean}) {
  if(work.format==="ep")return work.anime?"anime-ep":"ep";
  return work.anime?"anime":work.format;
}
