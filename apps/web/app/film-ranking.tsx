"use client";
import {rankingGroup,rankingTabs,workHref} from "../lib/work-links";
import {useEffect,useRef,useState,type ReactNode} from "react";

type Film={id:string;name:string;poster:string|null;format:string;anime:boolean};
type RankingTab=(typeof rankingTabs)[number];
type Ranked={title:string;tier:number};
type Automatic=Ranked&{average:number};
type Ranking={version:number;items:Ranked[];automatic:Automatic[]};
export const rankingCategories=["Obra-prima","Muito bom","Bom","Regular","Não gostei"];
const dragType="application/x-cena-film";

export function FilmRanking({films,visibility}:{visibility?:ReactNode;films:Film[]}) {
  const [tab,setTab]=useState<RankingTab>(rankingTabs[0]);
  const [ranking,setRanking]=useState<Ranking|null>(null);
  const [items,setItems]=useState<Ranked[]>([]);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const saving=useRef(false);
  const [draggingGroup,setDraggingGroup]=useState("");
  async function load() {
    try {
      const response=await fetch("/api/v1/me/ranking",{cache:"no-store"});
      if(!response.ok)throw new Error("Não foi possível carregar o ranking.");
      const result=await response.json() as Ranking;
      setRanking(result);setItems(result.items);setDirty(false);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar.");}
  }
  useEffect(()=>{void load();},[]);
  function move(group:string,id:string,tier:number,before?:string) {
    if(saving.current||busy||!ranking||id===before)return;
    const film=films.find(item=>item.id===id);
    if(!film||film.format==="tv"||rankingGroup(film)!==group)return;
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
  function reorder(id:string,direction:number,group:Ranked[]) {
    if(saving.current||!ranking)return;
    const current=items.find(item=>item.title===id);
    if(!current)return;
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
  function board(group:string,label:string) {
    const groupFilms=films.filter(film=>rankingGroup(film)===group);
    const available=new Map(groupFilms.map(film=>[film.id,film]));
    const automatic=(ranking?.automatic??[]).filter(item=>available.has(item.title));
    const manual=items.filter(item=>available.has(item.title));
    const visible=manual.concat(automatic);
    const canDrop=draggingGroup===group;
    const automaticOnly=group==="tv";

    function drop(event:React.DragEvent,tier:number,before?:string) {
      event.preventDefault();
      if(canDrop)move(group,event.dataTransfer.getData(dragType),tier,before);
      setDraggingGroup("");
    }

    function mini(film:Film,tier:number) {
      const peers=manual.filter(item=>item.tier===tier);
      const position=peers.findIndex(item=>item.title===film.id);
      const series=film.format==="tv";
      const score=automatic.find(item=>item.title===film.id);
      return <div className="rank-film" key={film.id} draggable={!series&&!busy&&!!ranking}
        onDragStart={event=>{
          if(series||busy||!ranking){event.preventDefault();return;}
          event.dataTransfer.setData(dragType,film.id);
          event.dataTransfer.effectAllowed="move";
          setDraggingGroup(group);
        }}
        onDragEnd={()=>setDraggingGroup("")}
        onDragOver={event=>{if(canDrop&&!series){event.preventDefault();event.stopPropagation();}}}
        onDrop={event=>{if(!series){event.stopPropagation();drop(event,tier,film.id);}}}>
        <a href={workHref(film.id)} draggable={false} className="rank-poster" title={film.name}>
          {film.poster?<img src={film.poster} alt={film.name} draggable={false} loading="lazy"/>:<span>{film.name}</span>}
        </a>
        {series?<small>{score?"★ "+score.average.toLocaleString("pt-BR")+" / 5":"Sem notas nos episódios"}</small>:<>
          <label className="sr-only" htmlFor={"rank-"+film.id}>Categoria de {film.name}</label>
          <select id={"rank-"+film.id} value={tier} disabled={busy||!ranking} onChange={event=>move(group,film.id,Number(event.target.value))}>
            <option value={-1}>Sem categoria</option>{rankingCategories.map((name,index)=><option key={name} value={index}>{name}</option>)}
          </select>
          {tier>=0&&<div className="rank-order">
            <button type="button" disabled={busy||position<=0} aria-label={"Mover "+film.name+" para antes"} onClick={()=>reorder(film.id,-1,peers)}>←</button>
            <button type="button" disabled={busy||position>=peers.length-1} aria-label={"Mover "+film.name+" para depois"} onClick={()=>reorder(film.id,1,peers)}>→</button>
          </div>}
        </>}
      </div>;
    }

    return <section className="ranking-board" key={group} aria-labelledby={"rank-board-"+group}>
      <h3 id={"rank-board-"+group}>{label}</h3>
      <p className="muted">{automaticOnly?"A média das temporadas define a categoria de cada série.":
        group==="anime"?"A média das temporadas define a categoria dos animes episódicos. Para as demais obras, arraste o card ou use o seletor.":
        "Arraste o card para uma categoria ou use o seletor."}</p>
      {rankingCategories.map((name,tier)=>{
        const groupItems=visible.filter(item=>item.tier===tier);
        return <div key={name} className={"rank-tier rank-tier-"+tier}
          onDragOver={event=>{if(canDrop)event.preventDefault();}} onDrop={event=>drop(event,tier)}>
          <h4>{name}</h4>
          <div className="rank-cards">
            {groupItems.map(item=>mini(available.get(item.title)!,tier))}
            {groupItems.length===0&&<span className="muted">{automaticOnly?"Nenhuma série nesta categoria":"Arraste para cá"}</span>}
          </div>
        </div>;
      })}
      <div className="rank-bank" onDragOver={event=>{if(canDrop)event.preventDefault();}} onDrop={event=>drop(event,-1)}>
        <h4>Sem categoria</h4>
        <div className="rank-cards">{groupFilms.filter(film=>!visible.some(item=>item.title===film.id)).map(film=>mini(film,-1))}</div>
        {!groupFilms.length&&<p className="muted">Marque obras como assistidas para organizar este ranking.</p>}
      </div>
    </section>;
  }
  return <section className="panel ranking" aria-labelledby="ranking-heading">
    <div className="section-heading ranking-heading"><div className="section-title-controls"><h2 id="ranking-heading" className="ranking-title"><span aria-hidden="true">👑</span> Meu ranking</h2>{visibility}</div><button className="primary" disabled={!dirty||busy||!ranking} onClick={()=>void save()}>{busy?"Salvando…":"Salvar ranking"}</button></div>
    <div className="row ranking-tabs" role="group" aria-label="Tipo de obra">
      {rankingTabs.map(item=><button key={item.id} type="button"
        aria-pressed={tab.id===item.id} onClick={()=>{setDraggingGroup("");setTab(item);}}>{item.label}</button>)}
    </div>
    {error&&<p role="alert" className="message error">{error} <button onClick={load} disabled={busy}>Recarregar ranking</button></p>}
    {message&&<p role="status" className="message">{message}</p>}
    {tab.boards.map(([group,label])=>board(group,label))}
  </section>;
}
