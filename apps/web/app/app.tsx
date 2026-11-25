"use client";
import {NotificationBell} from "./notification-bell";
import {useCallback,useEffect,useRef,useState,type ReactNode} from "react";
import {signIn,signOut} from "next-auth/react";
import {useRouter} from "next/navigation";
import {SeriesSeasons} from "./series-seasons";
import Link from "next/link";
import {EpisodeRatings} from "./episode-ratings";
import {WorkPeople,type PersonCredit} from "./work-people";
import {rankingGroup,rankingGroups,seasonHref,seasonName,workHref,workKind} from "../lib/work-links";
import {Poster} from "./poster";
import {CardTitle} from "./card-title";
import {ThemePicker} from "./theme-picker";
import {CatalogSearch} from "./catalog-search";
import {CatalogDrawer} from "./catalog-drawer";
import {FilmRanking,rankingCategories} from "./film-ranking";
import type {Release} from "../lib/releases";
import {Landing} from "./landing";
import {UiIcon} from "./ui-icons";
import {StarRating} from "./star-rating";
import {ProfileFriends} from "./profile-friends";
import {ProfileFriend} from "./profile-friend";
import {ReviewReport} from "./review-report";
import {ReviewEditor} from "./review-editor";
import {Icon,IconAction} from "./action-icons";
import {ProfileAvatar,ProfileForm,type Profile,type ProfileInput} from "./profile-form";

type TitleDetails={genres:string[];runtime:number|null;seasons:number|null;episodes:number|null;directors:string[];creators:string[];cast:string[];people?:PersonCredit[]};
type Title={id:string;format:string;anime:boolean;name:string;original:string;year:string;summary:string;poster:string|null;details?:TitleDetails|null};
type Entry={title:string;watched:boolean;interest:boolean;rewatching:boolean;rating:number|null;review:string|null;spoiler:boolean;version:number;hidden?:boolean;evaluation_public?:boolean;viewer_watched?:boolean;my_vote?:boolean|null};
type Viewing={id:string;title:string;watched_on:string|null;watched_at:string|null;rewatch:boolean};
type PendingViewing={title:string;name:string;watchedAt:string};
const profileSections = ["watchlist", "ranking", "watched", "diary"] as const;
type Section = typeof profileSections[number];
type Dashboard={visibility?:Record<Section,boolean>;ranking?:{title:string;tier:number}[];needsProfile?:boolean;profile?:Profile;library?:Entry[];diaryHasMore?:boolean;viewings?:Viewing[]};
type Review={username:string;name:string;avatar?:string;rating:number|null;review:string;spoiler:boolean;version:number;my_vote:boolean|null};
type RankedSeries={title:string;tier:number;average:number};
type SeasonProgress={watched:number;total:number;average:number|null};
type SeasonAverage={season:number;average:number};
type Community={seasons?:SeasonAverage[];average:number|null;rating_count:number;episode_rating_count?:number;reviews:Review[]};
const demoEvaluations=[
  {name:"Clara",rating:9,review:"Gostei de como a fotografia muda com o clima da história.",spoiler:false},
  {name:"Rafael",rating:6,review:"A atmosfera me ganhou, mas achei o começo lento.",spoiler:false},
  {name:"Bia",rating:10,review:"A escolha da personagem na cena final mudou minha leitura da história. Este comentário é fictício.",spoiler:true},
  {name:"Diego",rating:7,review:null,spoiler:false},
];
const demoSum=demoEvaluations.reduce((sum,item)=>sum+item.rating,0);
const demoEpisodeRatings=[
  {viewer:"Clara",episode:1,rating:9},{viewer:"Clara",episode:2,rating:8},
  {viewer:"Rafael",episode:1,rating:6},{viewer:"Bia",episode:2,rating:10},
  {viewer:"Diego",episode:3,rating:7},
];
function CommunityScore({average,count,demo=false,episodic=false}:{average:number|null;count:number;demo?:boolean;episodic?:boolean}) {
  return <div className="community-score">
    <div className="community-score-value"><strong>{average===null?"–":average.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2})}</strong><span> / 5</span></div>
    <div>
      <div className="community-stars" aria-hidden="true">
        ★★★★★<span style={{width:(average??0)*20+"%"}}>★★★★★</span>
      </div>
      <span className="muted">{episodic?(count===0?"Ainda não há notas públicas por episódio":count+(count===1?" pessoa avaliou":" pessoas avaliaram")):count===0?"Ainda não há notas públicas":demo?count+" avaliações fictícias":count+(count===1?" avaliação pública":" avaliações públicas")}</span>
    </div>
  </div>;
}
const categories=[["all","Explorar"],["movie","Filmes"],["tv","Séries"],["anime","Animes"]];
const labels:Record<string,string>={"demo-ultimo-rolo":"O Último Rolo","demo-mare-alta":"Maré Alta","demo-lua-de-papel":"Lua de Papel","demo-neon-norte":"Neon Norte","demo-fim-da-linha":"Fim da Linha","demo-arquipelago":"Arquipélago"};
const empty:Entry={title:"",watched:false,interest:false,rewatching:false,rating:null,review:null,spoiler:false,version:0};
const displayRating=(rating:number)=> (rating/2).toLocaleString("pt-BR");
const sessionDate=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"});
const sessionTime=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"});
async function api<T>(path:string,method="GET",body?:unknown,key?:string):Promise<T> {
  const headers:Record<string,string>={};
  if(body!==undefined) headers["Content-Type"]="application/json";
  if(key) headers["Idempotency-Key"]=key;
  const response=await fetch("/api/v1/"+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:"no-store"});
  const data=await response.text();
  const json=data?JSON.parse(data):null;
  if(!response.ok) throw new Error(json?.message || "Não foi possível concluir a ação.");
  return json;
}
type DiaryResult={items:Viewing[];hasMore:boolean};

function LibraryPage({section,username,dashboard,render}:{
  section:"watchlist"|"watched";username?:string;dashboard:Dashboard;render:(item:Entry,title?:Title)=>ReactNode;
}){
  const [page,setPage]=useState(1),[attempt,retry]=useState(0);
  const [result,setResult]=useState<{page:number;dashboard:Dashboard;items:Entry[];pages:number;titles:Map<string,Title>}|null>(null);
  const [error,setError]=useState("");
  const strip=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    let active=true;
    setError("");
    const params=new URLSearchParams({section,page:String(page)});
    if(username)params.set("username",username);
    (async()=>{
      const {items,pages}=await api<{items:Entry[];pages:number}>("library-page?"+params);
      if(!active)return;
      if(!items.length&&page>1){setPage(page-1);return;}
      const titles=items.length?await api<Title[]>("title-batch?ids="+encodeURIComponent(items.map(i=>i.title).join(","))):[];
      if(active)setResult({page,dashboard,items,pages,titles:new Map(titles.map(t=>[t.id,t]))});
    })().catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[section,username,dashboard,page,attempt]);
  useEffect(()=>{if(strip.current)strip.current.scrollLeft=0;},[page]);
  if(error)return <p role="alert">{error} <button onClick={()=>retry(n=>n+1)}>Tentar novamente</button></p>;
  if(!result||result.page!==page||result.dashboard!==dashboard)return <p role="status">Carregando obras…</p>;
  return <><div ref={strip} className="grid profile-card-strip">{result.items.map(item=>render(item,result.titles.get(item.title)))}</div>
    {!result.items.length&&<p className="muted">{section==="watchlist"?"Nenhuma obra salva.":"Nenhuma avaliação ou obra vista."}</p>}
    {result.pages>1&&<nav className="row pagination" aria-label={"Páginas de "+(section==="watched"?"Já vistos":"Vou ver")}>
      <button disabled={page===1} onClick={()=>setPage(1)} aria-label="Primeira página">«</button>
      <button disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button>
      <span aria-live="polite">{page} de {result.pages}</span>
      <button disabled={page===result.pages} onClick={()=>setPage(page+1)}>Próxima</button>
      <button disabled={page===result.pages} onClick={()=>setPage(result.pages)} aria-label="Última página">»</button>
    </nav>}</>;
}

function DiaryDialog({dashboard,username,title,name,onClose,renderSession,visibility,message}:{
  dashboard:Dashboard;username?:string;title:string;name:string;onClose:()=>void;
  renderSession:(item:Viewing)=>ReactNode;visibility:ReactNode;message:string;
}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const element=dialog.current;
    element?.showModal();
    return ()=>element?.close();
  },[]);
  const [page,setPage]=useState(1);
  const [attempt,retry]=useState(0);
  const [result,setResult]=useState<{dashboard:Dashboard;page:number;data:DiaryResult}|null>(null);
  const [failure,setFailure]=useState("");
  useEffect(()=>{
    let active=true;
    setFailure("");
    const params=new URLSearchParams({page:String(page),title});
    if(username)params.set("username",username);
    (async()=>{
      const data=await api<DiaryResult>("diary?"+params);
      if(!active)return;
      if(!data.items.length&&page>1){setPage(page-1);return;}
      setResult({dashboard,page,data});
    })().catch(error=>{if(active)setFailure(error.message);});
    return ()=>{active=false;};
  },[dashboard,page,username,title,attempt]);
  const data=result?.page===page&&result.dashboard===dashboard?result.data:null;
  function navigate(next:number){setFailure("");setPage(next);}
  return <dialog ref={dialog} className="session-dialog diary-dialog" aria-labelledby="diary-heading" onCancel={event=>{event.preventDefault();onClose();}}>
    <header>
      <h2 id="diary-heading">Diário · {name}</h2>
      <div className="diary-toolbar">
        {visibility&&<span className="diary-visibility">Visibilidade do Diário {visibility}</span>}
        <button autoFocus onClick={onClose}>Fechar</button>
      </div>
    </header>
    {message&&<p role="status">{message}</p>}
    {data?<><ul className="diary-sessions">{data.items.map(renderSession)}</ul>
      {!data.items.length&&<p className="muted">Nenhuma sessão registrada.</p>}</>:
      failure?<div role="alert">{failure} <button onClick={()=>{setFailure("");retry(n=>n+1);}}>Tentar novamente</button></div>:
      <p role="status">Carregando sessões…</p>}
    {(page>1||data?.hasMore)&&<nav className="row diary-pagination" aria-label="Páginas do Diário">
      <button disabled={page===1} onClick={()=>navigate(page-1)}>Anterior</button>
      <span aria-live="polite">Página {page}</span>
      <button disabled={!data?.hasMore} onClick={()=>navigate(page+1)}>Próxima</button>
    </nav>}
  </dialog>;
}

function FilmFacts({title}:{title:Title}) {
  const details=title.details;
  const fields=[
    [(title.format==="ep"||title.format==="seas")?"Série":"Título original",title.original!==title.name?title.original:""],
    ["Gêneros",details?.genres.join(", ")],
    ["Duração",details?.runtime?details.runtime+" min":""],
    ["Temporadas",details?.seasons],["Episódios",details?.episodes],
    ...(!details?.people?.length?[["Direção",details?.directors.join(", ")],["Criação",details?.creators.join(", ")],["Elenco",details?.cast.join(", ")]]:[]),
  ].filter(([,value])=>Boolean(value));
  return <>{!!fields.length&&<dl className="film-facts">{fields.map(([label,value])=>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
    {(title.id.startsWith("demo-")||title.id.startsWith("ep-demo-")||title.id.startsWith("season-demo-"))&&<p className="muted"><small>Obra e pôster ilustrativos.</small></p>}</>;
}
function Spoiler({hidden,children}:{hidden:boolean;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  return <div className="review-text">{hidden&&!open?<button className="small" onClick={()=>setOpen(true)}>Revelar spoiler</button>:children}</div>;
}
type SpoilerState={spoiler:boolean;my_vote?:boolean|null};
function ReviewReader({name,titleId,author,own,watched,text,version,initial}:{
  name?:string;titleId:string;author:string;own:boolean;watched:boolean;text:string;version:number;initial:SpoilerState
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [reading,setReading]=useState(false);
  const [state,setState]=useState(initial);
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  async function vote(value:boolean) {
    if(saving||state.my_vote===value)return;
    setSaving(true);setError("");
    try {
      setState(await api<SpoilerState>("titles/"+titleId+"/spoiler-vote","PUT",{username:author,version,containsSpoiler:value}));
    } catch(e){setError((e as Error).message);} finally{setSaving(false);}
  }
  const review=<Spoiler hidden={!own&&!watched&&state.spoiler}>{text}</Spoiler>;
  const votes=<>
    {!own&&<div className="spoiler-votes" role="group" aria-label="Votar sobre spoiler na resenha">
      {[true,false].map(value=>{
        const label=value?"Contém spoiler":"Não contém spoiler";
        return <IconAction key={String(value)} kind="spoiler" iconActive={value} active={state.my_vote===value}
          label={label} disabled={saving} onClick={()=>void vote(value)}/>;
      })}
    </div>}
    {error&&<p className="message error" role="alert">{error}</p>}
  </>;
  const report=!own&&<ReviewReport title={titleId} username={author} version={version}/>;
  if(!name)return <>{votes}{review}{report}</>;
  return <>
    <button type="button" aria-haspopup="dialog" aria-label={"Abrir resenha de "+name} title="Abrir resenha" onClick={()=>{
      setReading(true);
      dialog.current?.showModal();
    }}><UiIcon name="review"/></button>
    <dialog ref={dialog} className="session-dialog profile-review-dialog" aria-label={"Resenha de "+name} onClose={()=>setReading(false)}>
      <h2>Resenha de {name}</h2>
      {reading&&<>{review}{votes}{report}</>}
      <form method="dialog" className="row"><button>Fechar</button></form>
    </dialog>
  </>;
}
export function App({chronology,monthlyReviews,releases=[],authenticated,inviteLogin,emailAccounts,pageTitle,initialTab="all",profileUser,showCommunityDemo=false,seriesPart}:{seriesPart?:{seriesId:string;season:number;episode?:number};chronology?:ReactNode;monthlyReviews?:ReactNode;releases?:Release[];authenticated:boolean;inviteLogin:boolean;emailAccounts:boolean;pageTitle?:string;initialTab?:string;profileUser?:string;showCommunityDemo?:boolean}) {
  const router=useRouter();
  const [tab,setTab]=useState(initialTab),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1);
  const [titles,setTitles]=useState<Title[]>([]),[known,setKnown]=useState<Record<string,Title>>({}),[more,setMore]=useState(false),[demo,setDemo]=useState(false);
  const [diaryTitle,setDiaryTitle]=useState<{id:string;name:string}|null>(null);
  const [data,setData]=useState<Dashboard|null>(null),[other,setOther]=useState<Dashboard|null>(null);
  const [title,setTitle]=useState<Title|null>(null),[community,setCommunity]=useState<Community|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [rankedSeries,setRankedSeries]=useState<RankedSeries[]>([]);
  const [rankItems,setRankItems]=useState<{title:string;tier:number}[]|null>(null);
  const [viewing,setViewing]=useState<Viewing|null>(null);
  const [pendingViewing,setPendingViewing]=useState<PendingViewing|null>(null);
  const [credits,setCredits]=useState(false);
  const [reviewPending,setReviewPending]=useState(false);
  const [titleRetry,setTitleRetry]=useState(0);
  const detail=useRef<HTMLElement>(null);
  const sessionDialog=useRef<HTMLDialogElement>(null);
  const viewingDialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const dialog=viewingDialog.current;if(viewing&&!dialog?.open)dialog?.showModal();if(!viewing&&dialog?.open)dialog.close();},[viewing]);
  const pendingKeys=useRef(new Map<string,string>());
  const openSequence=useRef(0);
  useEffect(()=>{if(title)detail.current?.focus();},[title]);
  useEffect(()=>{
    const dialog=sessionDialog.current;
    if(pendingViewing&&!dialog?.open)dialog?.showModal();
    if(!pendingViewing&&dialog?.open)dialog.close();
  },[pendingViewing]);
  const label=(id:string)=>known[id]?.name??labels[id]??"Obra do catálogo";
  const fail=(e:unknown)=>setError(e instanceof Error?e.message:"Falha inesperada.");
  const refresh=useCallback(async()=>{const value=await api<Dashboard>(pageTitle?"me?title="+encodeURIComponent(pageTitle):tab==="ranking"?"me":"me?summary=true");setData(value);return value;},[pageTitle,tab==="ranking"]);
  useEffect(()=>{if(authenticated) refresh().catch(fail);},[authenticated,refresh]);
  useEffect(()=>{
    if(!authenticated || (tab==="profile"||tab==="ranking") || pageTitle) return;
    let current=true;
    setLoading(true);
    const params=new URLSearchParams({type:tab,query:search,page:String(page)});
    api<{items:Title[];hasMore:boolean;demo:boolean}>("titles?"+params).then(result=>{
      if(!current)return;
      setTitles(result.items);setKnown(previous=>({...previous,...Object.fromEntries(result.items.map(item=>[item.id,item]))}));setMore(result.hasMore);setDemo(result.demo);
    }).catch(e=>{if(current){setTitles([]);setMore(false);fail(e);}}).finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[authenticated,tab,search,page,pageTitle]);
  useEffect(()=>{
    if(tab!=="profile"&&tab!=="ranking")return;
    const current=other??data;
    if(!current)return;
    const ids=[...new Set([...(current.library??[]).map(i=>i.title),...(current.ranking??[]).map(i=>i.title),...(current.viewings??[]).map(i=>i.title)])].filter(id=>!known[id]);
    if(!ids.length)return;
    let currentRequest=true;
    (async()=>{
      const found:Title[]=[];
      for(let i=0;i<ids.length&&currentRequest;i+=30) {
        const group=await api<Title[]>("title-batch?ids="+encodeURIComponent(ids.slice(i,i+30).join(",")));
        found.push(...group);
      }
      if(currentRequest&&found.length)setKnown(prev=>({...prev,...Object.fromEntries(found.map(item=>[item.id,item]))}));
    })().catch(e=>{if(currentRequest)fail(e);});
    return ()=>{currentRequest=false;};
    // Resolve saved titles when the profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[tab,other,data,titleRetry]);
  async function action(work:()=>Promise<unknown>,message:string) {
    setError("");setNotice("");setBusy(true);
    try {await work();await refresh();setNotice(message);}catch(e){fail(e);}finally{setBusy(false);}
  }
  async function create(path:string,body:unknown) {
    const fingerprint=path+"\u0000"+JSON.stringify(body);
    const key=pendingKeys.current.get(fingerprint)??crypto.randomUUID();
    pendingKeys.current.set(fingerprint,key);
    const result=await api(path,"POST",body,key);
    pendingKeys.current.delete(fingerprint);
    return result;
  }
  function open(id:string) {router.push(workHref(id));}
  async function loadTitle(id:string) {
    const sequence=++openSequence.current;
    setError("");setNotice("");setCommunity(null);
    try{
      const item=await api<Title>("titles/"+id);
      if(sequence!==openSequence.current)return;
      setKnown(old=>({...old,[id]:item}));setTitle(item);
      if(data?.profile) {
        const result=await api<Community>("titles/"+id+"/community");
        if(sequence===openSequence.current)setCommunity(result);
      }
    }catch(e){if(sequence===openSequence.current)fail(e);}
  }
  useEffect(()=>{setTab(initialTab);},[initialTab]);
  useEffect(()=>{if(pageTitle)void loadTitle(pageTitle);},[pageTitle,data?.profile?.username]);
  useEffect(()=>{if(profileUser&&data?.profile)api<Dashboard>("profiles?summary=true&username="+encodeURIComponent(profileUser)).then(setOther).catch(fail);},[profileUser,data?.profile?.username]);
  useEffect(()=>{
    if(!data?.profile||!pageTitle)return;
    let current=true;
    api<{items:{title:string;tier:number}[];automatic:RankedSeries[]}>("me/ranking")
      .then(result=>{if(current){setRankItems(result.items);setRankedSeries(result.automatic);}})
      .catch(error=>{if(current)fail(error);});
    return ()=>{current=false;};
  },[data,pageTitle]);
  function rankControl(id:string) {
    if(!rankItems||!data?.library?.some(item=>item.title===id&&item.watched))return null;
    const tier=rankItems.find(item=>item.title===id)?.tier??-1;
    return <fieldset className="card-ranking">
      <legend>Ranking</legend>
      <div className="rank-choices">
        {rankingCategories.map((name,index)=>({name,index})).reverse().map(({name,index})=><button key={name} type="button"
          className={"rank-choice rank-tier-"+index} aria-pressed={tier===index} disabled={busy}
          onClick={()=>{
            const next=tier===index?-1:index;
            void action(async()=>{
              const result=await api<{items:{title:string;tier:number}[]}>("me/ranking/"+id,"PUT",{tier:next});
              setRankItems(result.items);
            },next===-1?"Removido do ranking.":"Ranking salvo.");
          }}>
          {tier===index&&<span aria-hidden="true">✓ </span>}{name}
        </button>)}
      </div>
    </fieldset>;
  }
  function closeTitle(){openSequence.current++;setTitle(null);if(pageTitle)router.push("/");}
  function changeTab(next:string){if(pageTitle||tab==="ranking"){router.push("/?aba="+next);return;}setTab(next);setPage(1);closeTitle();setError("");setNotice("");setOther(null);}
  function update(kind:string,body:unknown) {
    if(!title)return;
    return action(async()=>{await api("me/library/"+title.id+"/"+kind,"PUT",body);if(["review","rating","visibility"].includes(kind)&&data?.profile)setCommunity(await api<Community>("titles/"+title.id+"/community"));},"Alteração salva.");
  }
  async function refreshCommunity(id:string) {
    const sequence=openSequence.current;
    try {
      const next=await api<Community>("titles/"+id+"/community");
      if(sequence===openSequence.current)setCommunity(next);
    } catch(e){if(sequence===openSequence.current)fail(e);}
  }
  function visibilityControl(item:Entry) {
    const isPublic=!!item.evaluation_public;
    return <IconAction kind="visibility" active={isPublic} disabled={busy}
      label={isPublic?"Avaliação pública":"Avaliação privada"}
      onClick={()=>void action(async()=>{
        await api("me/library/"+item.title+"/visibility","PUT",{value:!isPublic});
        if(title?.id===item.title)await refreshCommunity(item.title);
      },isPublic?"Avaliação privada.":"Avaliação pública.")}/>;
  }
  function confirmViewing() {
    if(!pendingViewing||busy)return;
    const {title,watchedAt}=pendingViewing;
    void action(async()=>{
      await create("me/viewings",{title,watchedAt,rewatch:true});
      setPendingViewing(null);
    },"Sessão salva.");
  }
  const seasonProgressPath=seriesPart&&seriesPart.episode===undefined
    ?"me/season-progress/"+seriesPart.seriesId+"/"+seriesPart.season
    :null;
  const [seasonProgress,setSeasonProgress]=useState<SeasonProgress|null>(null);
  const [progressError,setProgressError]=useState("");
  const [progressRetry,setProgressRetry]=useState(0);
  useEffect(()=>{
    if(!seasonProgressPath||!data?.profile)return;
    let current=true;
    setProgressError("");
    api<SeasonProgress>(seasonProgressPath).then(result=>{if(current)setSeasonProgress(result);})
      .catch(error=>{if(current)setProgressError((error as Error).message);});
    return ()=>{current=false;};
  },[seasonProgressPath,data,progressRetry]);
  const complete=!!seasonProgress&&seasonProgress.total>0&&seasonProgress.watched===seasonProgress.total;
  const seriesScore=rankedSeries.find(item=>item.title===title?.id);
  const entry=data?.library?.find(item=>item.title===title?.id)??empty;
  const current=other??data;
  const owned=!other||other.profile?.username===data?.profile?.username;
  function sectionVisibility(section:Section|"all",label:string){
    if(!owned)return null;
    const visible=section==="all"?profileSections.every(key=>current?.visibility?.[key]):!!current?.visibility?.[section];
    const mixed=section==="all"&&!visible&&profileSections.some(key=>current?.visibility?.[key]);
    const hint=section==="all"?(mixed?"Algumas seções visíveis para visitantes":visible?"Todas as seções visíveis para visitantes":"Todas as seções ocultas para visitantes"):label.charAt(0).toUpperCase()+label.slice(1)+": "+(section==="watched"?(visible?"visíveis para visitantes":"ocultos para visitantes"):(visible?"visível para visitantes":"oculto para visitantes"));
    return <button type="button" className="visibility-toggle" disabled={busy} aria-label={hint} title={hint} aria-pressed={mixed?"mixed":visible} onClick={()=>void action(()=>api("me/visibility","PUT",{section,visible:!visible}),section==="diary"?"":visible?"Seção oculta para visitantes.":"Seção visível para visitantes.")}><UiIcon name={visible?"eye":"hidden"}/></button>;
  }
  function showSection(section:Section){return owned||!!current?.visibility?.[section];}
  function saveProfile(input:ProfileInput) {
    void action(()=>api("me/profile","PUT",input),"Perfil salvo.");
  }
  function savedCard(id:string) {
    const work=known[id];
    return <button className="card" onClick={()=>open(id)}>
      {work?<Poster title={work}/>:<div className="poster"><span>{label(id)}</span></div>}
      <CardTitle>{label(id)}</CardTitle>
      {work&&<small>{work.year} · {workKind(work)}</small>}
    </button>;
  }
  async function visit(username:string) {
    if(pageTitle){router.push("/?usuario="+encodeURIComponent(username));return;}
    try {const person=await api<Dashboard>("profiles?summary=true&username="+encodeURIComponent(username));changeTab("profile");setOther(person);}catch(e){fail(e);}
  }
  return <>
    <header className="top"><div className="wrap nav">
      <button className="logo" onClick={()=>changeTab("all")}><span className="mark">◈</span> cena<span>aberta</span></button>
      {authenticated&&<nav aria-label="Catálogo">{categories.map(([id,name])=><button key={id} className={(tab===id?"nav-active ":"")+"catalog-desktop-category"} onClick={()=>changeTab(id)}>{name}</button>)}<CatalogDrawer categories={categories.map(([id,name])=>[id,id==="all"?"Todos":name])} current={tab} onSelect={changeTab}/><a className="room-nav-link catalog-news-link" href="/noticias">Notícias</a><a className="room-nav-link" href="/salas"><UiIcon name="card"/>Sélete</a></nav>}
      <div className={authenticated?"account account-signed-in":"account"}>
        {authenticated?<>
          <NotificationBell/>
          <button type="button" className="nav-profile" aria-label="Meu perfil" title="Meu perfil" aria-current={tab==="profile"&&!pageTitle&&owned?"page":undefined} onClick={()=>changeTab("profile")}>
            {data?.profile?<ProfileAvatar name={data.profile.name} avatar={data.profile.avatar}/>:(
              <span className="profile-avatar profile-initial" aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="8" r="3.5"/>
                  <path d="M5 20v-1a7 7 0 0 1 14 0v1"/>
                </svg>
              </span>
            )}
            <span className="nav-profile-label">Meu perfil</span>
          </button>
          <button type="button" className="nav-signout" aria-label="Sair" title="Sair da conta" onClick={()=>signOut({callbackUrl:"/"})}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m3-12 4 4-4 4m-5-4h9"/>
            </svg>
            <span>Sair</span>
          </button>
        </>:emailAccounts?<>
          <a className="account-link nav-login" href="/conta">Entrar</a>
          <a className="account-link primary" href="/conta?modo=register">Criar conta</a>
        </>:null}
      </div>
    </div></header>
    <main className="wrap">
      {error&&<p role="alert" className="message error">{error}{(tab==="profile"||tab==="ranking")&&<button className="small" onClick={()=>{setError("");setTitleRetry(n=>n+1);}}>Tentar carregar os cards novamente</button>}</p>}{notice&&<p role="status" className="message">{notice}</p>}
      {pageTitle&&!title&&!error&&<p role="status">Carregando detalhes da obra…</p>}
      {!authenticated?<Landing monthlyReviews={monthlyReviews} releases={releases} actions={<>{emailAccounts&&<><a className="primary account-link" href="/conta?modo=register">Criar conta</a><a className="account-link landing-login" href="/conta">Já tenho conta</a></>}{inviteLogin&&<button className="primary" onClick={()=>signIn("keycloak",{callbackUrl:"/"})}>Entrar com convite</button>}</>}/>:<>

        {data?.needsProfile&&<section className="panel"><h2>Crie seu perfil</h2><ProfileForm busy={busy} onSave={saveProfile}/></section>}
        {!pageTitle&&(tab==="ranking"?(data?.profile&&<FilmRanking visibility={sectionVisibility("ranking","meu ranking")} films={(data.library??[]).filter(item=>item.watched&&known[item.title]).map(item=>known[item.title])}/>):tab!=="profile"?<>
          <section className="hero"><div className="hero-copy"><p className="eyebrow">FILMES · SÉRIES · ANIMES</p><h1>Qual é a<br/><em>próxima sessão?</em></h1>
          <CatalogSearch key={tab} category={tab} query={query} onChange={value=>{setQuery(value);if(!value){setSearch("");setPage(1);}}}
            onSearch={()=>{setSearch(query.trim());setPage(1);}} onOpen={open}/></div><div className="reel" aria-hidden="true"><i/><i/><i/></div></section>
          <section aria-busy={loading}><div className="section-heading"><h2>{search?"Resultados da busca":categories.find(([id])=>id===tab)?.[1]}</h2>{demo&&<span className="muted">Catálogo fictício</span>}</div>
          {loading?<p>Carregando catálogo…</p>:titles.length?<div className="grid">{titles.map(item=><article className="catalog-card" key={item.id}><button className="card" onClick={()=>open(item.id)}><Poster title={item}/><CardTitle>{item.name}</CardTitle><small>{item.year} · {workKind(item)}</small></button></article>)}</div>:<p>Nenhuma obra nesta página.</p>}
          {(page>1||more)&&<div className="row pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</button><span>Página {page}</span><button disabled={!more} onClick={()=>setPage(page+1)}>Próxima</button></div>}</section>
          {tab==="all"&&!search&&monthlyReviews}
        </>:<section><div className="section-heading profile-heading"><div className="row">{current?.profile&&<ProfileAvatar name={current.profile.name} avatar={current.profile.avatar}/>}<div><h1>{current?.profile?.name??"Meu perfil"}</h1>{current?.profile&&<span className="muted">@{current.profile.username}</span>}</div></div></div>
          {!owned&&current?.profile&&<ProfileFriend key={current.profile.username} username={current.profile.username}/>}
          {owned&&current?.profile&&<><nav className="profile-shortcuts" aria-label="Atalhos do perfil"><a className="room-nav-button" href="/conta/configuracoes">Minha conta</a><a className="room-nav-button" href="/ranking"><UiIcon name="crown"/>Meu ranking</a><a className="room-nav-button" href="/amigos"><UiIcon name="friends"/>Meus amigos</a><a className="room-nav-button" href="/importar"><UiIcon name="import"/>Importar Letterboxd</a></nav><div className="profile-visibility-all">{sectionVisibility("all","todas as seções")}<span>Visibilidade do perfil<small>Controle cada seção pelo ícone de olho ou use este para mostrar/ocultar todas. Avaliações públicas nas obras continuam com controle próprio.</small></span></div></>}
          {owned&&current?.profile&&<details className="panel"><summary>Editar perfil</summary><ThemePicker/><ProfileForm profile={current.profile} busy={busy} onSave={saveProfile}/></details>}
          {!owned&&current?.profile?.bio&&<p>{current.profile.bio}</p>}
          {current?.profile&&<>
          {!owned&&<ProfileFriends key={current.profile.username} username={current.profile.username}/>}
          {showSection("watchlist")&&<section className="panel"><div className="section-heading"><h2>Vou ver</h2>{sectionVisibility("watchlist","Vou ver")}</div><LibraryPage key={current.profile.username} section="watchlist" dashboard={current} username={owned?undefined:current.profile.username} render={(item,saved)=>{
            return <button key={item.title} className="card" onClick={()=>open(item.title)}>
              {saved?<Poster title={saved}/>:<div className="poster art-0"><span>{label(item.title)}</span></div>}
              <CardTitle>{(saved?.name??label(item.title))}</CardTitle>
              {saved&&<small>{saved.year} · {workKind(saved)}</small>}
            </button>;
          }}/></section>}
          {showSection("watched")&&<section className="panel"><div className="section-heading"><h2>Já vistos e avaliações</h2>{sectionVisibility("watched","já vistos")}</div><LibraryPage key={current.profile.username} section="watched" dashboard={current} username={owned?undefined:current.profile.username} render={(item,saved)=>{
            return <article className="catalog-card" key={item.title}><button className="card" onClick={()=>open(item.title)}>
              {saved?<Poster title={saved}/>:<div className="poster art-0"><span>{label(item.title)}</span></div>}
              <CardTitle>{(saved?.name??label(item.title))}</CardTitle>{saved&&<small>{saved.year} · {workKind(saved)}</small>}
            </button><div className="diary-rating">{saved && saved.format!=="tv"&&item.rating&&<span>★ {displayRating(item.rating)}</span>}
              <div className="profile-card-actions">{item.review&&<ReviewReader key={[item.version,item.spoiler,item.my_vote].join("-")} name={saved?.name??label(item.title)} titleId={item.title} author={current.profile!.username} own={owned} watched={!!item.viewer_watched} text={item.review} version={item.version} initial={item}/>}{showSection("diary")&&<button type="button" aria-haspopup="dialog" aria-label={"Abrir Diário de "+(saved?.name??label(item.title))} title="Abrir Diário da obra" onClick={()=>{setError("");setNotice("");setDiaryTitle({id:item.title,name:saved?.name??label(item.title)});}}><UiIcon name="diary"/></button>}</div></div></article>;
          }}/></section>}
          {diaryTitle&&showSection("diary")&&<DiaryDialog key={diaryTitle.id} title={diaryTitle.id} name={diaryTitle.name} dashboard={current} username={owned?undefined:current.profile?.username} onClose={()=>setDiaryTitle(null)} visibility={sectionVisibility("diary","diário")} message={viewing?"":error||notice} renderSession={item=><li key={item.id}><span>{item.watched_on?.split("-").reverse().join("/")??"Data não informada"}{item.watched_at&&<> às <time dateTime={item.watched_at}>{sessionTime.format(new Date(item.watched_at))}</time></>}{item.rewatch?" · Revisto":""}</span>{owned&&<div className="diary-actions"><button type="button" aria-label={"Editar sessão de "+diaryTitle.name} title="Editar sessão" disabled={busy} onClick={()=>{setError("");setViewing(item);}}><UiIcon name="edit"/></button><button type="button" aria-label={"Excluir sessão de "+diaryTitle.name} title="Excluir sessão" disabled={busy} onClick={()=>{if(confirm("Excluir a sessão de "+diaryTitle.name+" do Diário?"))void action(()=>api("me/viewings/"+item.id,"DELETE"),"Registro excluído.");}}><UiIcon name="trash"/></button></div>}</li>}/>}
          {!owned&&showSection("ranking")&&<section className="panel"><h2><UiIcon name="crown"/> Ranking</h2>{rankingGroups.map(([kind,label])=><div key={kind}><h3>{label}</h3>{rankingCategories.map((category,tier)=><div className={"public-ranking-tier rank-tier-"+tier} key={tier}><h4>{category}</h4><div className="public-ranking-cards">{current.ranking?.filter(item=>item.tier===tier&&known[item.title]&&rankingGroup(known[item.title])===kind).map(item=><div className="catalog-card" key={item.title}>{savedCard(item.title)}</div>)}</div></div>)}</div>)}</section>}
          {!owned&&!profileSections.some(key=>current.visibility?.[key])&&<p className="muted">As seções deste perfil estão privadas.</p>}</>}
        </section>)}
      </>}
      {title&&<section ref={detail} tabIndex={-1} className="panel detail" aria-label="Detalhes da obra"><div className="section-heading"><h2>Detalhes</h2></div>
      {seriesPart&&<nav className="work-back-links" aria-label="Navegação da série">
        <Link className="room-nav-button" href={workHref(seriesPart.seriesId)}>
          {seriesPart.episode===undefined&&<UiIcon name="back"/>}Voltar à série
        </Link>
        {seriesPart.episode!==undefined&&<Link className="room-nav-button" href={seasonHref(seriesPart.seriesId,seriesPart.season)}>
          <UiIcon name="back"/>{seriesPart.season===0?"Voltar aos especiais":"Voltar à temporada"}
        </Link>}
      </nav>}
      <div className="detail-grid"><Poster title={title} large/><div><p className="eyebrow">{seriesPart?(seasonName(seriesPart.season)+(seriesPart.episode===undefined?"":" · Episódio "+seriesPart.episode)):(workKind(title).toLocaleUpperCase("pt-BR")+" · "+(title.year||"ANO INDISPONÍVEL"))}</p><h2>{title.name}</h2><p>{title.summary||"Sinopse indisponível."}</p><FilmFacts title={title}/>
      {data?.profile&&<><div className="row">
        {title.format==="seas"?<div className="row season-progress-actions">
          <span className="season-watch-status"><Icon kind="watched" active={entry.watched}/>{entry.watched?"Já vi":"Ainda não vi"}</span>
          <button type="button" className={complete?"":"primary"} disabled={busy||!seasonProgress?.total||complete||!!progressError}
            onClick={()=>{if(seasonProgressPath)void action(async()=>{
              setSeasonProgress(await api<SeasonProgress>(seasonProgressPath,"PUT",{}));
            },"Temporada marcada como vista completamente.");}}>
            {complete?"✓ Vi completamente":"Vi completamente"}
          </button>
        </div>:<IconAction kind="watched" active={entry.watched} disabled={busy||reviewPending} label={entry.watched?"Já vi":"Não vi"} onClick={()=>{void update("watched",{value:!entry.watched});}}/>}
        {(!entry.watched||entry.interest)&&<IconAction kind="interest" active={entry.interest} disabled={busy} label={entry.interest?"No Vou ver":"Vou ver"} onClick={()=>{void update("interest",{value:!entry.interest});}}/>}
        {entry.watched&&<><IconAction kind="rewatching" active={entry.rewatching} disabled={busy} label={entry.rewatching?"Vi novamente":"Sem revisualização"} onClick={()=>{void update("rewatching",{value:!entry.rewatching});}}/>
        <button disabled={busy||!entry.rewatching} aria-haspopup="dialog" title={!entry.rewatching?"Marque Vi novamente para registrar outra sessão.":undefined} onClick={()=>{
          setError("");
          setPendingViewing({title:title.id,name:title.name,watchedAt:new Date().toISOString()});
        }}>Registrar sessão</button></>}</div>
      {title.format==="seas"&&<div className="season-progress-summary">
        {progressError?<p role="alert">{progressError} <button type="button" onClick={()=>setProgressRetry(value=>value+1)}>Tentar novamente</button></p>:
          seasonProgress?<p role="status">{seasonProgress.watched} de {seasonProgress.total} episódios vistos
            {seasonProgress.average!==null&&<> · Minha média <strong>★ {seasonProgress.average.toLocaleString("pt-BR")} / 5</strong></>}
          </p>:<p role="status">Carregando progresso…</p>}
      </div>}
      {entry.watched&&<div className="form">
      {title.format==="tv"?(seriesScore?
        <p><strong>Minha média</strong> · ★ {seriesScore.average.toLocaleString("pt-BR")} / 5 · {rankingCategories[seriesScore.tier]}</p>:
        <p className="muted">Avalie os episódios para calcular a nota e a categoria da série.</p>):
        title.format!=="seas"&&rankControl(title.id)}
      {title.format!=="tv"&&title.format!=="seas"&&<StarRating key={title.id} disabled={busy} value={entry.rating} onChange={rating=>{void update("rating",{rating});}}/>}
      <ReviewEditor key={title.id} title={title.id} initial={entry} disabled={busy} onPending={setReviewPending} onSaved={async()=>{await refresh();await refreshCommunity(title.id);}} visibility={visibilityControl({...entry,title:title.id})}/>
      </div>}</>}
      </div></div>
      {title.format==="tv"&&<SeriesSeasons key={title.id} title={title.id}/>}
      {chronology}
      {!!title.details?.people?.length&&<WorkPeople people={title.details.people} titleId={title.id}/>}
      {community&&<section className="community" aria-labelledby="community-heading">
        <h3 id="community-heading">Comunidade</h3>
        <CommunityScore average={community.average} count={community.rating_count} episodic={title.format==="tv"||title.format==="seas"}/>
        {(title.format==="tv"||title.format==="seas")&&<p className="muted">{title.format==="seas"?"Média dos episódios avaliados":"Média das temporadas avaliadas"} · {community.episode_rating_count??0} notas registradas</p>}
        <h4>Resenhas</h4>
        {!community.reviews.length&&<p className="muted">Nenhuma resenha publicada.</p>}
        {community.reviews.map(review=><article className="record" key={review.username}>
          <div className="row review-author"><button className="review-author-link" disabled={review.username===data?.profile?.username} onClick={()=>visit(review.username)}>
            <ProfileAvatar name={review.name} avatar={review.avatar}/>{review.name}
          </button>
          {title.format!=="tv"&&review.rating!==null&&<span className="review-score">★ {displayRating(review.rating)}</span>}</div>
          <ReviewReader key={[title.id,review.version,review.spoiler,review.my_vote].join("-")} titleId={title.id} author={review.username} own={review.username===data?.profile?.username} watched={entry.watched} text={review.review} version={review.version} initial={review}/>
        </article>)}
        {showCommunityDemo&&<section className="community" aria-label="Comunidade de demonstração">
          <h4>Comunidade de demonstração</h4>
          {title.format==="tv"?<>
            <CommunityScore average={demoEpisodeRatings.reduce((sum,item)=>sum+item.rating,0)/demoEpisodeRatings.length/2}
              count={new Set(demoEpisodeRatings.map(item=>item.viewer)).size} demo episodic/>
            <p className="muted">{demoEpisodeRatings.length} notas fictícias por episódio</p>
            {demoEpisodeRatings.map(item=><div className="record row review-author" key={item.viewer+"-"+item.episode}>
              <ProfileAvatar name={item.viewer}/><strong>{item.viewer}</strong><span>Temp. 1 · Ep. {item.episode}</span>
              <span className="review-score">★ {displayRating(item.rating)}</span>
            </div>)}
          </>:<CommunityScore average={demoSum/demoEvaluations.length/2} count={demoEvaluations.length} demo/>}
          {title.format!=="tv"&&demoEvaluations.filter(item=>item.review).map(item=><article className="record" key={item.name}>
            <div className="row review-author"><ProfileAvatar name={item.name}/><CardTitle>{item.name}</CardTitle><span className="review-score">★ {displayRating(item.rating)}</span></div>
            <Spoiler hidden={!entry.watched&&item.spoiler}>{item.review}</Spoiler>
          </article>)}
        </section>}
      </section>}
      </section>}
      {title?.format==="seas"&&seriesPart&&<EpisodeRatings key={title.id} title={seriesPart.seriesId} season={seriesPart.season} allowRating={!!data?.profile&&entry.watched} onSaved={()=>{void refreshCommunity(title.id);void refresh().catch(fail);}}/>}
      <dialog className="session-dialog" ref={sessionDialog} aria-labelledby="session-heading" onCancel={event=>{
        event.preventDefault();
        if(!busy){setPendingViewing(null);setError("");}
      }}>
        {pendingViewing&&<>
          <h2 id="session-heading">Registrar sessão?</h2>
          <p>Adicionar uma revisualização de <strong>{pendingViewing.name}</strong> ao <strong className="profile-section-name">Diário</strong>, em {sessionDate.format(new Date(pendingViewing.watchedAt))}?</p>
          {error&&<p role="alert" className="message error">{error}</p>}
          <div className="row">
            <button type="button" autoFocus disabled={busy} onClick={()=>{setPendingViewing(null);setError("");}}>Cancelar</button>
            <button type="button" className="primary" disabled={busy} onClick={confirmViewing}>{busy?"Registrando…":"Confirmar"}</button>
          </div>
        </>}
      </dialog>
      <dialog className="session-dialog" ref={viewingDialog} aria-labelledby="edit-viewing-heading" onCancel={event=>{event.preventDefault();if(!busy){setViewing(null);setError("");}}}>{viewing&&<><h2 id="edit-viewing-heading">Editar sessão</h2><p>{diaryTitle?.id===viewing.title?diaryTitle.name:label(viewing.title)}</p>{error&&<p role="alert" className="message error">{error}</p>}<form key={viewing.id} className="form" onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);const body={title:viewing.title,date:form.get("date")||null,rewatch:form.has("rewatch")};void action(async()=>{await api("me/viewings/"+viewing.id,"PUT",body);setViewing(null);},"Sessão salva.");}}><label>Data (opcional)<input autoFocus disabled={busy} name="date" type="date" defaultValue={viewing.watched_on??""}/></label><label className="check"><input disabled={busy} name="rewatch" type="checkbox" defaultChecked={viewing.rewatch}/>Já tinha visto antes</label><div className="row"><button className="primary" disabled={busy}>Salvar sessão</button><button type="button" disabled={busy} onClick={()=>{setViewing(null);setError("");}}>Cancelar</button></div></form></>}</dialog>
      {credits&&<section className="panel"><h2>Sobre o alpha</h2><p>Cena Aberta é um diário audiovisual em desenvolvimento. O catálogo de demonstração usa obras fictícias.</p><p><a href="https://www.themoviedb.org/"><img src="https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" width={88} alt="The Movie Database"/></a></p><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>A visibilidade das seções é definida por você no perfil. Novas notas e resenhas são públicas por padrão. Você pode tornar cada avaliação privada pelo controle de visibilidade. Somente as seções habilitadas ficam visíveis para quem visita seu perfil.</p></section>}
    </main><footer className="wrap footer"><span>Cena Aberta · Alpha</span><button onClick={()=>setCredits(!credits)}>Sobre, créditos e privacidade</button></footer>
  </>;
}
