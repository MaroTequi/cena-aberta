import {redirect} from "next/navigation";

export async function profileState(actor:string) {
  const secret=process.env.SOCIAL_INTERNAL_SECRET;
  if(!secret)throw new Error("Serviço de perfil indisponível.");
  const result=await fetch((process.env.SOCIAL_URL??"http://127.0.0.1:8182")+"/me?summary=true",{
    headers:{"X-Internal-Key":secret,"X-Actor":actor},cache:"no-store",signal:AbortSignal.timeout(6500),
  });
  if(!result.ok)throw new Error("Não foi possível verificar seu perfil. Tente novamente.");
  return await result.json() as {needsProfile?:boolean;paused?:boolean;profile?:{name:string;avatar?:string}};
}
export async function requireProfile(actor:string,next="/") {
  const state=await profileState(actor);
  if(state.paused)redirect("/conta/configuracoes");
  if(state.needsProfile||!state.profile)redirect("/conta/perfil?next="+encodeURIComponent(next));
  return state.profile;
}
