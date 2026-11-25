import {profileState} from "../../../../lib/profile";
import {getServerSession} from "next-auth";
import {authOptions} from "../../../../lib/auth";

const routes = [
  ["PUT", /^notifications\/rooms\/[a-f0-9-]{36}\/read$/,"social"],
  ["GET", /^notifications$/,"social"],
  ["GET", /^library-page$/,"social"],
  ["GET", /^diary$/,"social"],
  ["POST", /^backups$/,"backup"],
  ["GET", /^backups(?:\/[a-f0-9]{48})?$/,"backup"],
  ["GET", /^feedback\/[a-f0-9-]{36}\/images\/[a-f0-9-]{36}$/,"social"],
  ["PUT", /^rooms\/[a-f0-9-]{36}\/reconsider\/[a-z0-9-]+$/,"social"],
  ["PUT", /^me\/visibility$/,"social"],
  ["DELETE", /^rooms\/[a-f0-9-]{36}$/,"social"],
  ["GET", /^friends(?:\/(?:search|status|profile))?$/,"social"],
  ["POST", /^friends$/,"social"],
  ["PUT", /^friends\/[a-f0-9-]{36}$/,"social"],
  ["PUT", /^rooms\/[a-f0-9-]{36}\/settings$/,"social"],
  ["GET", /^feedback\/review-reports$/,"social"],
  ["PUT", /^feedback\/review-reports\/[a-f0-9-]{36}$/,"social"],
  ["POST", /^titles\/[a-z0-9-]+\/review-report$/,"social"],
  ["GET", /^feedback(?:\/access)?$/,"social"],
  ["POST", /^feedback$/,"social"],
  ["PUT", /^feedback\/[a-f0-9-]{36}(?:\/thanks)?$/,"social"],
  ["GET", /^profiles$/,"social"],
  ["GET", /^rooms(?:\/[a-f0-9-]{36}(?:\/friends)?)?$/,"social"],
  ["POST", /^rooms(?:\/[a-f0-9-]{36}\/(?:join|leave|invite|start|more|choose\/[a-z0-9-]+))?$/,"social"],
  ["PUT", /^rooms\/[a-f0-9-]{36}\/votes\/[a-z0-9-]+$/,"social"],
  ["GET", /^titles\/[a-z0-9-]+\/seasons(?:\/[0-9]+)?$/,"catalog"],
  ["GET", /^me\/season-progress\/[a-z0-9-]+\/[0-9]+$/,"social"],
  ["GET", /^me\/series-progress\/[a-z0-9-]+$/,"social"],
  ["GET", /^me\/episodes\/[a-z0-9-]+(?:\/[0-9]+)?$/,"social"],
  ["PUT", /^me\/episodes\/[a-z0-9-]+\/[0-9]+\/[0-9]+$/,"social"],
  ["GET", /^me\/ranking$/,"social"],
  ["PUT", /^me\/ranking(?:\/[a-z0-9-]+)?$/,"social"],
  ["GET", /^title-batch$/,"catalog"],
  ["GET", /^titles(?:\/(?:demo-[a-z0-9-]+|tmdb-(?:movie|tv)-[0-9]+|(?:ep|season)-[a-z0-9-]+))?$/,"catalog"],
  ["PUT", /^titles\/[a-z0-9-]+\/spoiler-vote$/,"social"],
  ["GET", /^(?:me|profiles\/[a-z0-9_]+|titles\/[a-z0-9-]+\/(?:reviews|community))$/,"social"],
  ["PUT", /^me\/(?:profile|library\/[a-z0-9-]+\/(?:watched|interest|rating|review|rewatching|visibility)|viewings\/[a-f0-9-]{36})$/,"social"],
  ["POST", /^me\/viewings$/,"social"],
  ["DELETE", /^me\/viewings\/[a-f0-9-]{36}$/,"social"],
] as const;

async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}) {
  const path = (await params).path.join("/");
  const route = routes.find(([method,pattern])=>method===request.method && pattern.test(path));
  if (!route) return Response.json({message:"Operação não encontrada."},{status:404});
  const session=await getServerSession(authOptions) as {actor?:string} | null;
  if(!session?.actor) return Response.json({message:"Entre para continuar."},{status:401});
  if(!(request.method==="GET" && path==="me") && !(request.method==="PUT" && path==="me/profile")) {
    try {
      if((await profileState(session.actor)).needsProfile)return Response.json({message:"Conclua seu perfil para continuar.",code:"PROFILE_REQUIRED"},{status:403});
    } catch {return Response.json({message:"Serviço de perfil indisponível."},{status:503});}
  }
  const url=new URL(request.url);
  if(request.method!=="GET") {
    const origin=process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).origin : url.origin;
    if(request.headers.get("origin")!==origin) return Response.json({message:"Origem inválida."},{status:403});
  }
  const catalog=route[2]==="catalog";
  const backup=route[2]==="backup";
  const base=backup ? "http://backup:8183" : catalog ? process.env.CATALOG_URL ?? "http://127.0.0.1:8181" : process.env.SOCIAL_URL ?? "http://127.0.0.1:8182";
  const secret=catalog ? process.env.CATALOG_INTERNAL_SECRET : process.env.SOCIAL_INTERNAL_SECRET;
  if(!secret) return Response.json({message:"Serviço indisponível."},{status:503});
  try {
    const headers:Record<string,string>={"X-Internal-Key":secret,"X-Actor":session.actor};
    const idempotency=request.headers.get("Idempotency-Key");
    if(idempotency) headers["Idempotency-Key"]=idempotency;
    let body:string | undefined;
    if(request.method==="PUT" || request.method==="POST") {
      const limit=path==="feedback"?5_400_000:path==="me/profile"?105000:16384;
      const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let bytes=0;
      if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();return Response.json({message:"Solicitação muito grande."},{status:413});}chunks.push(value);}}
      const payload=new Uint8Array(bytes);let position=0;for(const chunk of chunks){payload.set(chunk,position);position+=chunk.byteLength;}body=new TextDecoder().decode(payload);
      headers["Content-Type"]="application/json";
    }
    const result=await fetch(base+"/"+path+(backup?"":url.search),{method:request.method,headers,body,cache:"no-store",signal:backup && path.startsWith("backups/") ? request.signal : AbortSignal.timeout(path.startsWith("rooms/")&&(path.endsWith("/start")||path.endsWith("/more"))?65000:path==="title-batch"?25000:/^me\/(?:season|series)-progress\//.test(path)?15000:6500)});
    return new Response(result.body,{status:result.status,headers:{...(backup && result.headers.has("content-disposition")?{"Content-Disposition":result.headers.get("content-disposition")!}:{}),"Content-Type":result.headers.get("content-type")??"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  } catch {
    return Response.json({message:"Serviço temporariamente indisponível. Tente novamente."},{status:503});
  }
}
export {proxy as GET,proxy as PUT,proxy as POST,proxy as DELETE};
