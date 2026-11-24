import "server-only";
const sources=[
  {topic:"Filmes",slug:"filmes",name:"Cinema com Rapadura",host:"cinemacomrapadura.com.br",query:"categories=7&tags_exclude=3788,3872"},
  {topic:"Séries",slug:"series",name:"Mix de Séries",host:"mixdeseries.com.br",query:"categories=4&categories_exclude=5"},
  {topic:"Animes",slug:"animes",name:"JBox",host:"www.jbox.com.br",query:"categories=18"},
  {topic:"Filmes",slug:"filmes",name:"O Vício",host:"ovicio.com.br",query:"categories=4"},
  {topic:"Séries",slug:"series",name:"O Vício",host:"ovicio.com.br",query:"categories=5"},
  {topic:"Animes",slug:"animes",name:"ANMTV",host:"anmtv.com.br",query:"categories=7"},
] as const;
export const topics=Array.from(new Map(sources.map(s=>[s.slug,{slug:s.slug,topic:s.topic}])).values());
type Source=typeof sources[number];
type Article={source:Source;title:string;link:string;date:Date};
type Post={title?:{rendered?:string};link?:string;date_gmt?:string};
export const dateFormat=new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"short",year:"numeric",timeZone:"America/Sao_Paulo"});
const entities:Record<string,string>={amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" ",hellip:"…",ndash:"–",mdash:"—",rsquo:"’",lsquo:"‘",ldquo:"“",rdquo:"”"};
function headline(value:string){
  return value.replace(/<[^>]*>/g,"").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,key:string)=>{
    if(key[0]!=="#")return entities[key]??match;
    const code=key[1].toLowerCase()==="x"?parseInt(key.slice(2),16):Number(key.slice(1));
    return code>0&&code<=0x10ffff?String.fromCodePoint(code):"";
  }).trim();
}
async function articles(source:Source):Promise<Article[]>{
  const response=await fetch("https://"+source.host+"/wp-json/wp/v2/posts?"+source.query+"&orderby=date&order=desc&per_page=12&_fields=link,title,date_gmt",{
    next:{revalidate:1800},headers:{"User-Agent":"CenaAberta/1.0"},redirect:"error",signal:AbortSignal.timeout(8000)
  });
  if(!response.ok)throw new Error("Fonte indisponível");
  const posts:Post[]=await response.json();
  const result:Article[]=[];
  for(const post of posts){
    if(!post.link||!post.title?.rendered||!post.date_gmt)continue;
    const url=URL.parse(post.link);
    const date=new Date(post.date_gmt+"Z");
    if(url?.origin!=="https://"+source.host||url.username||url.password||!Number.isFinite(date.getTime()))continue;
    const title=headline(post.title.rendered);
    if(title)result.push({source,title,link:url.href,date});
  }
  return result;
}
export async function newsFeed(selected?:Source["slug"]){
  const active=selected?sources.filter(s=>s.slug===selected):sources;
  const feeds=await Promise.allSettled(active.map(articles));
  const failed=active.filter((_,i)=>feeds[i].status==="rejected");
  const unique=new Map<string,Article>();
  for(const feed of feeds)if(feed.status==="fulfilled")for(const item of feed.value)unique.set(item.link,item);
  const items=[...unique.values()].sort((a,b)=>b.date.getTime()-a.date.getTime());
  return {items,failed};
}
