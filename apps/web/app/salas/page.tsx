import {getServerSession} from "next-auth";
import {redirect} from "next/navigation";
import {authOptions} from "../../lib/auth";
import {requireProfile} from "../../lib/profile";
import {MovieRoom} from "./room";
export const dynamic="force-dynamic";
export default async function Rooms({searchParams}:{searchParams:Promise<{sala?:string}>}){
  const {sala}=await searchParams;
  const id=sala&&/^[a-f0-9-]{36}$/.test(sala)?sala:undefined;
  const next=id?"/salas?sala="+id:"/salas";
  const session=await getServerSession(authOptions) as {actor?:string}|null;
  if(!session?.actor)redirect("/conta?next="+encodeURIComponent(next));
  const {name,avatar}=await requireProfile(session.actor,next);
  return <MovieRoom id={id} profile={{name,avatar}}/>;
}
