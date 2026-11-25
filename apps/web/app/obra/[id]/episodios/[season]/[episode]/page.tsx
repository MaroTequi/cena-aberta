import Link from "next/link";
import {getServerSession} from "next-auth";
import {notFound,redirect} from "next/navigation";
import {authOptions} from "../../../../../../lib/auth";
import {requireProfile} from "../../../../../../lib/profile";
import type {Episode} from "../../../../../episode-card";
import {Poster} from "../../../../../poster";

export default async function EpisodePage({params}: {
  params:Promise<{id:string; season:string; episode:string}>;
}) {
  const session=await getServerSession(authOptions) as {actor?:string}|null;
  if(!session?.actor)redirect("/conta");
  await requireProfile(session.actor);

  const {id,season,episode}=await params;
  if(!/^(demo-[a-z0-9-]+|tmdb-tv-[0-9]{1,13})$/.test(id) ||
    !/^(0|[1-9][0-9]{0,3})$/.test(season) || Number(season)>1000 ||
    !/^[1-9][0-9]{0,8}$/.test(episode))notFound();

  const href="/obra/"+id;
  const catalog=process.env.CATALOG_URL??"http://127.0.0.1:8181";
  const response=await fetch(catalog+"/titles/"+id+"/seasons/"+season,{
    headers:{"X-Internal-Key":process.env.CATALOG_INTERNAL_SECRET??""},
    cache:"no-store",signal:AbortSignal.timeout(11000),
  }).catch(()=>null);
  if(response?.status===404||response?.status===400)notFound();
  if(!response?.ok)return <main className="wrap">
    <Link href={href}>Voltar à série</Link>
    <p role="status">Não foi possível carregar o episódio. Tente recarregar a página.</p>
  </main>;

  const episodes:Episode[]=await response.json();
  const current=episodes.find(item=>item.number===Number(episode));
  if(!current)notFound();

  const label="Episódio "+episode;
  const name=current.name||label;
  return <main className="wrap">
    <p><Link href={href}>Voltar à série</Link></p>
    <section className="panel episode-detail">
      <Poster title={{id:id+"/"+season+"/"+episode,name,poster:current.still}} large/>
      <div>
        <p className="muted">{season==="0"?"Especiais":"Temporada "+season}{current.name&&" · "+label}</p>
        <h1>{name}</h1>
        {current.summary&&<p>{current.summary}</p>}
      </div>
    </section>
  </main>;
}
