"use client";
import {rankingGroup,rankingGroups,workHref} from "../lib/work-links";
import {useEffect,useRef,useState,type ReactNode} from "react";

type Film={id:string;name:string;poster:string|null};
type Ranked={title:string;tier:number};
type Automatic=Ranked&{average:number};
type Ranking={version:number;items:Ranked[];automatic:Automatic[]};
export const rankingCategories=["Obra-prima","Muito bom","Bom","Regular","Não gostei"];
const dragType="application/x-cena-film";

export function FilmRanking({films,visibility}:{visibility?:ReactNode;films:(Film&{format:string;anime:boolean})[]}) {
  const [kind,setKind]=useState("movie");
  const [ranking,setRanking]=useState<Ranking|null>(null);
  const [items,setItems]=useState<Ranked[]>([]);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const saving=useRef(false);
  const [dragging,setDragging]=useState("");
  async function load() {
    try {
      const response=await fetch("/api/v1/me/ranking",{cache:"no-store"});
      if(!response.ok)throw new Error("Não foi possível carregar o ranking.");
      const result=await response.json() as Ranking;
      setRanking(result);setItems(result.items);setDirty(false);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar.");}
  }
  useEffect(()=>{void load();},[]);
  const groupFilms=films.filter(film=>rankingGroup(film)===kind);
  const available=new Map(groupFilms.map(film=>[film.id,film]));
  const automatic=(ranking?.automatic??[]).filter(item=>available.has(item.title));
  const manual=items.filter(item=>available.has(item.title));
  const visible=manual.concat(automatic);
  function move(id:string,tier:number,before?:string) {
    if(saving.current||busy||!ranking||!available.has(id)||id===before||groupFilms.some(film=>film.id===id&&film.format==="tv"))return;
    const next=items.filter(item=>item.title!==id);
    if(tier>=0) {
      if(next.length>=100){setError("O ranking aceita até 100 obras.");return;}
      const position=before?next.findIndex(item=>item.title===before):-1;
      next.splice(position<0?next.length:position,0,{title:id,tier});
    }
    setItems(next);setDirty(true);setMessage("");setError("");
    void save(next);
  }
  async function save(nextItems:Ranked[]=items) {
    if(!ranking||saving.current)return;
    saving.current=true;
    setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/v1/me/ranking",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:ranking.version,items:nextItems})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message??"Não foi possível salvar.");
      setRanking(result);setItems(result.items);setDirty(false);setMessage("Ranking salvo.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar.");}
    finally{saving.current=false;setBusy(false);}
  }
  function reorder(id:string,direction:number) {
    if(saving.current||!ranking)return;
    const current=items.find(item=>item.title===id);
    if(!current)return;
    const group=manual.filter(item=>item.tier===current.tier);
    const index=group.findIndex(item=>item.title===id);
    const neighbor=group[index+direction];
    if(!neighbor)return;
    const next=[...items];
    const from=next.findIndex(item=>item.title===id);
    const to=next.findIndex(item=>item.title===neighbor.title);
    [next[from],next[to]]=[next[to],next[from]];
    setItems(next);setDirty(true);
    void save(next);
  }
  function mini(film:Film&{format?:string},tier:number) {
    const group=manual.filter(item=>item.tier===tier);
    const position=group.findIndex(item=>item.title===film.id);
    const series=film.format==="tv";
    const score=automatic.find(item=>item.title===film.id);
    return <div className="rank-film" key={film.id} draggable={!series&&!busy&&!!ranking}
      onDragStart={event=>{event.dataTransfer.setData(dragType,film.id);event.dataTransfer.effectAllowed="move";setDragging(film.id);}}
      onDragEnd={()=>setDragging("")}
      onDragOver={event=>{if(dragging){event.preventDefault();event.stopPropagation();}}}
      onDrop={event=>{event.preventDefault();event.stopPropagation();move(event.dataTransfer.getData(dragType),tier,film.id);setDragging("");}}>
      <a href={workHref(film.id)} draggable={false} className="rank-poster" title={film.name}>
        {film.poster?<img src={film.poster} alt={film.name} draggable={false} loading="lazy"/>:<span>{film.name}</span>}
      </a>
      {series?<small>{score?"★ "+score.average.toLocaleString("pt-BR")+" / 5":"Sem notas nos episódios"}</small>:<>
      <label className="sr-only" htmlFor={"rank-"+film.id}>Categoria de {film.name}</label>
      <select id={"rank-"+film.id} aria-label={"Categoria de "+film.name} value={tier} disabled={busy||!ranking} onChange={event=>move(film.id,Number(event.target.value))}>
        <option value={-1}>Sem categoria</option>{rankingCategories.map((name,index)=><option key={name} value={index}>{name}</option>)}
      </select>
      {tier>=0&&<div className="rank-order">
        <button type="button" disabled={busy||position<=0} aria-label={"Mover "+film.name+" para antes"} onClick={()=>reorder(film.id,-1)}>←</button>
        <button type="button" disabled={busy||position>=group.length-1} aria-label={"Mover "+film.name+" para depois"} onClick={()=>reorder(film.id,1)}>→</button>
      </div>}</>}
    </div>;
  }
  function drop(event:React.DragEvent,tier:number) {
    event.preventDefault();move(event.dataTransfer.getData(dragType),tier);setDragging("");
  }
  return <section className="panel ranking" aria-labelledby="ranking-heading">
    <div className="section-heading ranking-heading"><div className="section-title-controls"><h2 id="ranking-heading" className="ranking-title"><span aria-hidden="true">👑</span> Meu ranking</h2>{visibility}</div><button className="primary" disabled={!dirty||busy||!ranking} onClick={()=>void save()}>{busy?"Salvando…":"Salvar ranking"}</button></div>
    <div className="row ranking-tabs" role="group" aria-label="Tipo de obra">
      {rankingGroups.map(([id,label])=><button key={id} type="button"
        aria-pressed={kind===id} onClick={()=>setKind(id)}>{label}</button>)}
    </div>
    <p className="muted">{kind==="tv"?"A média das temporadas define a categoria de cada série.":
      "Arraste as obras assistidas para uma categoria ou use o seletor de cada card. Séries e animes episódicos usam a média das temporadas."}</p>
    {error&&<p role="alert" className="message error">{error} <button onClick={load} disabled={busy}>Recarregar ranking</button></p>}
    {message&&<p role="status" className="message">{message}</p>}
    {rankingCategories.map((name,tier)=><div key={name} className={"rank-tier rank-tier-"+tier}
      onDragOver={event=>{if(dragging)event.preventDefault();}} onDrop={event=>drop(event,tier)}>
      <h3>{name}</h3><div className="rank-cards">{visible.filter(item=>item.tier===tier).map(item=>mini(available.get(item.title)??{id:item.title,name:"Filme do ranking",poster:null},tier))}
      {!visible.some(item=>item.tier===tier)&&<span className="muted">{kind==="tv"?"Nenhuma série nesta categoria":"Arraste para cá"}</span>}</div>
    </div>)}
    <div className="rank-bank" onDragOver={event=>{if(dragging)event.preventDefault();}} onDrop={event=>drop(event,-1)}>
      <h3>Sem categoria</h3><div className="rank-cards">{groupFilms.filter(film=>!visible.some(item=>item.title===film.id)).map(film=>mini(film,-1))}</div>
      {!groupFilms.length&&<p className="muted">Marque obras como assistidas para organizar <strong className="profile-section-name">Meu ranking</strong>.</p>}
    </div>
  </section>;
}
