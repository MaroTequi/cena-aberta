"use client";
import {useEffect,useState} from "react";
import {UiIcon} from "./ui-icons";

type Episode={number:number;name:string;summary:string};
type Season={episodes:Episode[]}|{failed:true};

export function SeriesEpisodes({title,seasons}:{title:string;seasons:number}){
  const [requested,setRequested]=useState(false);
  const [results,setResults]=useState<Record<number,Season>>({});
  const [attempt,setAttempt]=useState(0);
  const numbers=Array.from({length:Math.max(1,seasons)},(_,index)=>index+1).concat(0);
  useEffect(()=>{
    if(!requested)return;
    const abort=new AbortController();
    const queue=Array.from({length:Math.max(1,seasons)},(_,index)=>index+1).concat(0);
    async function worker(){
      while(!abort.signal.aborted){
        const season=queue.shift();
        if(season===undefined)return;
        let result:Season;
        try{
          const response=await fetch("/api/v1/titles/"+title+"/seasons/"+season,{signal:abort.signal});
          if(season===0&&response.status===404)result={episodes:[]};
          else{
            if(!response.ok)throw new Error();
            const episodes:Episode[]=await response.json();
            result={episodes:episodes.sort((a,b)=>a.number-b.number)};
          }
        }catch{result={failed:true};}
        if(!abort.signal.aborted)setResults(old=>({...old,[season]:result}));
      }
    }
    void Promise.all([worker(),worker()]);
    return ()=>abort.abort();
  },[requested,title,seasons,attempt]);
  return <details className="work-credits" onToggle={event=>{if(event.currentTarget.open)setRequested(true);}}>
    <summary><UiIcon name="room"/>Episódios</summary>
    {numbers.map(number=>{
      const result=results[number];
      if(number===0&&(!result||("episodes" in result&&!result.episodes.length)))return null;
      return <section key={number}><h4>{number===0?"Especiais":"Temporada "+number}</h4>
        {!result?<p role="status">Carregando episódios…</p>:"failed" in result?<p role="status">Não foi possível carregar esta temporada.
          {" "}<button type="button" onClick={()=>setAttempt(value=>value+1)}>Tentar novamente</button></p>:
          result.episodes.length?<ol className="series-episode-list">{result.episodes.map(ep=><li key={ep.number} value={ep.number}>
            <strong>{ep.name||"Episódio "+ep.number}</strong>
            {ep.summary&&<details><summary>Sinopse</summary><p>{ep.summary}</p></details>}
          </li>)}</ol>:<p>Nenhum episódio disponível.</p>}
      </section>;
    })}
  </details>;
}
