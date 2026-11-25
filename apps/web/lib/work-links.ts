export function workHref(id:string) {
  const episode=/^ep-((?:demo-[a-z0-9-]{1,60}|tmdb-tv-[1-9][0-9]{0,12}))-s(0|[1-9][0-9]{0,2}|1000)-e([1-9][0-9]{0,8})$/.exec(id);
  return episode?"/obra/"+episode[1]+"/episodios/"+episode[2]+"/"+episode[3]:"/obra/"+encodeURIComponent(id);
}

export function workKind({anime,format}:{anime:boolean;format:string}) {
  if(format==="ep")return "Episódio";
  if(anime)return "Anime";
  return format==="movie"?"Filme":"Série";
}
