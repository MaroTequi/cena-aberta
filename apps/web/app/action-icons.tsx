"use client";
import {useId,useState,type ReactNode} from "react";

type Kind="watched"|"interest"|"rewatching"|"spoiler"|"visibility";

export function Icon({kind,active}:{kind:Kind;active:boolean}) {
  const fill=active?"currentColor":"none";
  const detail=active?"var(--icon-ink,var(--panel))":"currentColor";
  let shape:ReactNode;
  switch(kind) {
    case "watched":
      shape=<><rect x="3" y="5" width="18" height="14" rx="3" fill={fill}/><path stroke={detail} d="M7 5v14m10-14v14M3 10h4m-4 4h4m10-4h4m-4 4h4"/>{active?<path stroke={detail} d="m9.5 12 1.5 1.5 3.5-3.5"/>:<path d="m10.5 10 3.5 2-3.5 2z" fill="currentColor" stroke="none"/>}</>;
      break;
    case "interest":
      shape=<><path fill={fill} d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z"/><path stroke={detail} strokeDasharray="1 2.4" d="M8 7v10"/>{active?<path stroke={detail} d="m11 12 2 2 4-4"/>:<path d="M11 12h6m-3-3v6"/>}</>;
      break;
    case "rewatching":
      shape=<><path d="M4 9h15l-3-3m4 9H5l3 3"/>{active&&<path fill="currentColor" stroke="none" d="m4 9 4-4v3H4zm16 6-4 4v-3h4z"/>}<path d="M3 13v-3a1 1 0 0 1 1-1m17 2v3a1 1 0 0 1-1 1"/></>;
      break;
    case "visibility":
      shape=active
        ?<><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>
        :<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>;
      break;
    case "spoiler":
      shape=<><path fill={fill} d="M12 3 21 7v5c0 4-4 7-9 9-5-2-9-5-9-9V7z"/>{active?<><path stroke={detail} d="M12 8v4"/><circle fill={detail} stroke="none" cx="12" cy="15" r="1"/></>:<path d="m8.5 11.5 2.5 2.5 4.5-4.5"/>}</>;
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}

export function IconAction({kind,active,iconActive=active,label,disabled,onClick}:{kind:Kind;iconActive?:boolean;active:boolean;label:string;disabled:boolean;onClick:()=>void}) {
  const id=useId();
  const caption=kind==="visibility"||kind==="spoiler"?null:label;
  return <span className="icon-control" data-kind={kind}>
    <button type="button" className="icon-action" aria-label={label} aria-describedby={id} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon kind={kind} active={iconActive}/></button>
    {caption&&<span className="touch-icon-caption" aria-hidden="true">{caption}</span>}
    <span className="icon-tooltip" role="tooltip" id={id}>{label}</span>
  </span>;
}

export function SpoilerControl({initial,disabled,onChange}:{initial:boolean;disabled:boolean;onChange?:(value:boolean)=>void}) {
  const [active,setActive]=useState(initial);
  const id=useId();
  const label=active?"Contém spoiler":"Sem spoiler";
  return <span className="icon-control spoiler-icon" data-kind="spoiler">
    <label className={"icon-action"+(active?" is-active":"")}>
      <input type="checkbox" name="spoiler" checked={active} onChange={event=>{setActive(event.target.checked);onChange?.(event.target.checked);}} disabled={disabled} aria-label={label} aria-describedby={id}/>
      <Icon kind="spoiler" active={active}/>
    </label>
    <span className="icon-tooltip" role="tooltip" id={id}>{label}</span>
  </span>;
}
