import "server-only";
import {ReviewReport} from "./review-report";
import {Poster} from "./poster";
import {ProfileAvatar} from "./profile-form";

type Release = {id:string; name:string; released:string; poster:string|null};
type Review = {title:string; own:boolean; version:number; username:string; avatar?:string; name:string; rating:number|null; review:string; spoiler:boolean; review_published_at:string|null};
type Entry = Review & {work:Release};

async function internal<T>(service:"social"|"catalog", path:string, ids?:string[], viewer?:string):Promise<T> {
  const social=service==="social";
  const key=social?process.env.SOCIAL_INTERNAL_SECRET:process.env.CATALOG_INTERNAL_SECRET;
  if(!key)throw new Error("Serviço indisponível");
  const base=social?(process.env.SOCIAL_URL??"http://127.0.0.1:8182"):(process.env.CATALOG_URL??"http://127.0.0.1:8181");
  const headers:Record<string,string>={"X-Internal-Key":key};
  if(viewer)headers["X-Actor"]=viewer;
  if(ids)headers["Content-Type"]="application/json";
  const response=await fetch(base+path,{method:ids?"POST":"GET",headers,body:ids?JSON.stringify(ids):undefined,
    cache:"no-store",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error("Consulta indisponível");
  return response.json();
}

const reviewDate=new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"short",timeZone:"America/Sao_Paulo"});
async function latest(viewer?:string){
  const ids=await internal<string[]>("social","/public-review-titles");
  let entries:Entry[]=[];
  for(let start=0;start<ids.length;start+=8){
    const releases=await internal<Release[]>("catalog","/review-releases",ids.slice(start,start+8));
    if(!releases.length)continue;
    const byId=new Map(releases.map(work=>[work.id,work]));
    const reviews=await internal<Review[]>("social","/public-release-reviews",releases.map(work=>work.id),viewer);
    entries.push(...reviews.map(review=>({...review,work:byId.get(review.title)!})));
    const time=(entry:Entry)=>entry.review_published_at?new Date(entry.review_published_at).getTime():0;
    entries.sort((a,b)=>time(b)-time(a)||a.title.localeCompare(b.title)||a.username.localeCompare(b.username));
    entries=entries.slice(0,50);
  }
  return entries;
}

function ReviewStars({rating}:{rating:number}){
  return <span className="monthly-review-stars" role="img" aria-label={(rating/2).toLocaleString("pt-BR",{maximumFractionDigits:2})+" de 5 estrelas"}>
            {Array.from({length:5},(_,index)=>{
              const fill=Math.max(0,Math.min(100,(rating/2-index)*100));
              return <i key={index} className="star-shape" aria-hidden="true" style={{background:`linear-gradient(90deg,var(--accent) ${fill}%,var(--muted) ${fill}%)`}}/>;
            })}
          </span>;
}

export async function MonthlyReviews({viewer}:{viewer?:string}){
  let entries:Entry[]|null;
  try{entries=await latest(viewer);}catch{entries=null;}
  return <section className="panel" aria-labelledby="monthly-reviews-heading">
    <h2 id="monthly-reviews-heading">Resenhas</h2>
    {entries===null?<p role="status">Não foi possível carregar as resenhas agora.</p>:
      entries.length===0?<p className="muted">Ainda não há resenhas públicas de obras lançadas neste mês.</p>:
      entries.map(item=><article className="record monthly-review" key={JSON.stringify([item.title,item.username])}>
        <Poster title={item.work}/>
        <div className="monthly-review-copy"><h3>{viewer?<a href={"/obra/"+encodeURIComponent(item.title)}>{item.work.name}</a>:item.work.name}</h3>
        <div className="monthly-review-body"><small className="monthly-review-author"><ProfileAvatar name={item.name} avatar={item.avatar}/><span>{item.name}</span>
          {item.rating!=null&&<ReviewStars rating={item.rating}/>}{item.review_published_at&&<> · <time dateTime={item.review_published_at}>{reviewDate.format(new Date(item.review_published_at))}</time></>}</small>
        {item.spoiler?<details><summary>Revelar spoiler</summary><div className="review-text">{item.review}</div></details>:
          <div className="review-text">{item.review}</div>}</div>
        {viewer&&!item.own&&<ReviewReport key={item.version} title={item.title} username={item.username} version={item.version}/>}
        </div>
      </article>)}
  </section>;
}
