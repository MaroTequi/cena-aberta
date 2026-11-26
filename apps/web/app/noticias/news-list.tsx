"use client";
import {EditorialImage} from "../editorial-image";
import {useLayoutEffect,useRef,useState} from "react";

type Item={topic:string;source:string;title:string;link:string;date:string;iso:string;image?:string};
export function NewsList({topics,failed,items}:{topics:string[];failed:{topic:string;name:string}[];items:Item[]}){
  const [topic,setTopic]=useState("Todos");
  const list=useRef<HTMLDivElement>(null);
  const visible=topic==="Todos"?items:items.filter(item=>item.topic===topic);
  const unavailable=failed.filter(s=>topic==="Todos"||s.topic===topic);
  useLayoutEffect(()=>{
    const box=list.current;
    if(!box)return;
    box.scrollTop=0;
    const first=Array.from(box.children).slice(0,3);
    function measure(){
      if(box)box.style.height=first.reduce((sum,row)=>sum+row.getBoundingClientRect().height,0)+"px";
    }
    measure();
    const observer=new ResizeObserver(measure);
    first.forEach(row=>observer.observe(row));
    return ()=>observer.disconnect();
  },[topic,items]);
  return <>
    <div className="landing-news-filters" role="group" aria-label="Filtrar notícias por tema">
      {["Todos",...topics].map(name=><button type="button" key={name} aria-pressed={topic===name} onClick={()=>setTopic(name)}>{name}</button>)}
    </div>
    {unavailable.length>0&&<p role="status">Notícias indisponíveis agora em {unavailable.map(s=>s.topic+" ("+s.name+")").join(", ")}.</p>}
    {!visible.length&&!unavailable.length&&<p>Nenhuma notícia disponível.</p>}
    {visible.length>0&&<div ref={list} className="landing-news-list" role="region" aria-label={"Manchetes · "+topic} tabIndex={0}>
      {visible.map(item=><article className="editorial-row" key={item.link}><EditorialImage src={item.image} topic={item.topic}/><div><small>{item.topic} · {item.source} · <time dateTime={item.iso}>{item.date}</time></small>
        <h3><a href={item.link}>{item.title}</a></h3></div></article>)}
    </div>}
  </>;
}
