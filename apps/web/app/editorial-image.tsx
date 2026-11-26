"use client";

export function EditorialImage({src,topic}:{src?:string;topic:string}) {
  const asset=topic==="Animes"?"animacao":topic==="Séries"?"series":"cinema";
  const fallback="/avatars/"+asset+".svg";
  return <img className="editorial-image" src={src || fallback} alt="" width={96} height={68}
    loading="lazy" referrerPolicy="no-referrer" onError={event=>{
      if(event.currentTarget.getAttribute("src")!==fallback)event.currentTarget.src=fallback;
    }}/>;
}
