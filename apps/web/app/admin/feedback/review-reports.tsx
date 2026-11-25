"use client";

import {useEffect,useState} from "react";
import {workHref} from "../../../lib/work-links";
import {reviewReportReasons,type ReviewReportReason} from "../../../lib/review-report-reasons";

type Report={id:string;title:string;author:string;reporter:string;reason:ReviewReportReason;details:string;review_text:string;created:string;review_version:number};

export function ReviewReports(){
  const [resolved,setResolved]=useState(false);
  const [offset,setOffset]=useState(0);
  const [revision,setRevision]=useState(0);
  const [page,setPage]=useState<{items:Report[];hasMore:boolean}|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const controller=new AbortController();
    setPage(null);
    setError("");
    fetch("/api/v1/feedback/review-reports?resolved="+resolved+"&offset="+offset,{signal:controller.signal})
      .then(response=>{
        if(!response.ok)throw new Error("Não foi possível carregar as denúncias.");
        return response.json();
      }).then(result=>{if(!controller.signal.aborted)setPage(result);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[resolved,offset,revision]);

  async function change(id:string) {
    setBusy(true);
    setError("");
    try {
      const response=await fetch("/api/v1/feedback/review-reports/"+id,{
        method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({resolved:!resolved}),
      });
      if(!response.ok)throw new Error("Não foi possível atualizar a denúncia.");
      setRevision(value=>value+1);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível atualizar a denúncia.");}
    finally{setBusy(false);}
  }

  return <section className="panel" aria-labelledby="review-reports-heading">
    <h2 id="review-reports-heading">Denúncias de resenhas</h2>
    <label>Mostrar <select value={String(resolved)} disabled={busy} onChange={event=>{setOffset(0);setResolved(event.target.value==="true");}}>
      <option value="false">Pendentes</option>
      <option value="true">Resolvidas</option>
    </select></label>
    {error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></p>}
    {!page&&!error&&<p role="status">Carregando denúncias…</p>}
    {page?.items.length===0&&<p>Nenhuma denúncia nesta página.</p>}
    {page?.items.map(report=><article className="record" key={report.id}>
      <h3>{reviewReportReasons[report.reason]}</h3>
      <p>Resenha de @{report.author} · Reportada por @{report.reporter} · {new Date(report.created).toLocaleString("pt-BR")}</p>
      {report.details&&<p className="review-text">{report.details}</p>}
      <details><summary>Ver resenha reportada</summary><p className="review-text">{report.review_text}</p></details>
      <div className="row">
        <a href={workHref(report.title)}>Abrir obra</a>
        <button type="button" disabled={busy} onClick={()=>void change(report.id)}>{resolved?"Reabrir denúncia":"Marcar como resolvida"}</button>
      </div>
    </article>)}
    {(offset>0||page?.hasMore)&&<div className="row">
      <button type="button" disabled={busy||offset===0} onClick={()=>setOffset(value=>value-50)}>Anterior</button>
      <button type="button" disabled={busy||!page?.hasMore} onClick={()=>setOffset(value=>value+50)}>Próxima</button>
    </div>}
  </section>;
}
