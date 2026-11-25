import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createServer, request as httpRequest } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { isIPv4 } from "node:net";

const catalog = "http://127.0.0.1:19181";
const social = "http://127.0.0.1:19182";
const previewHost=process.env.SMOKE_PREVIEW_HOST;
if(previewHost && (process.env.SMOKE_PREVIEW!=="true" ||
    !isIPv4(previewHost) || !/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(previewHost))) {
  throw new Error("A prévia em rede exige SMOKE_PREVIEW=true e um IPv4 privado da rede local.");
}
const webHost=previewHost??"127.0.0.1";
const tlsCert=process.env.SMOKE_TLS_CERT;
const tlsKey=process.env.SMOKE_TLS_KEY;
const useTls=Boolean(tlsCert||tlsKey);
if(useTls&&(!tlsCert||!tlsKey||process.env.SMOKE_PREVIEW!=="true")) {
  throw new Error("Informe SMOKE_TLS_CERT e SMOKE_TLS_KEY com SMOKE_PREVIEW=true.");
}
const web = (useTls?"https://":"http://")+webHost+(useTls?":19443":":19180");
const tlsPreview=useTls?createHttpsServer({cert:readFileSync(tlsCert),key:readFileSync(tlsKey)},(req,res)=>{
  const upstream=httpRequest({
    hostname:"127.0.0.1",port:19180,path:req.url,method:req.method,
    headers:{...req.headers,"x-forwarded-host":new URL(web).host,"x-forwarded-proto":"https","x-forwarded-port":"19443"},
  },response=>{
    res.writeHead(response.statusCode,response.headers);
    response.pipe(res);
  });
  upstream.on("error",()=>{
    if(res.headersSent)res.destroy();
    else {res.writeHead(502);res.end("Prévia temporariamente indisponível.");}
  });
  req.on("aborted",()=>upstream.destroy());
  req.pipe(upstream);
}):null;
const email="conta-"+randomUUID()+"@example.test";
const key = randomUUID();
const actor = "demo_smoke_user";
const title = "demo-lua-de-papel";
const children = [];
const mockCalls=[];
const mock=createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  mockCalls.push(url);
  res.setHeader("Content-Type","application/json");
  if(req.headers.authorization!=="Bearer fake-smoke-token" || url.searchParams.get("language")!=="pt-BR"){
    res.statusCode=401;res.end("{}");return;
  }
  if(url.searchParams.get("query")==="limite"){res.statusCode=429;res.end("{}");return;}
  const film={id:777,title:"Filme simulado",original_title:"Mock Movie",release_date:"2024-01-01",original_language:"pt",overview:"Sinopse",poster_path:"/example.jpg"};
  const series={id:777,name:"Série simulada",original_language:"ja",first_air_date:"2025-01-01",genre_ids:[16]};
  if(url.pathname==="/3/search/movie") res.end(JSON.stringify({results:[url.searchParams.get("query")==="sem-generos"?{...film,id:800}: {...film,genre_ids:[18]}],total_pages:2}));
  else if(url.pathname==="/3/discover/movie"&&url.searchParams.has("primary_release_date.lte"))res.end(JSON.stringify({results:[{...film,vote_count:500,vote_average:8},{...film,id:778,adult:true},{...film,id:779,release_date:"2099-01-01"}],total_pages:2}));
  else if(url.pathname==="/3/discover/movie")res.end(JSON.stringify({results:[],total_pages:1}));
  else if(url.pathname==="/3/discover/tv")res.end(JSON.stringify({results:[series],total_pages:1}));
  else if((url.pathname==="/3/movie/777"||url.pathname==="/3/movie/800"))res.end(JSON.stringify({...film,id:Number(url.pathname.split("/").pop()),belongs_to_collection:{id:555},runtime:124,genres:[{name:"Drama"}],credits:{crew:[{id:20,job:"Director",name:"Diretora Exemplo",profile_path:"/example.jpg"}],cast:[{id:21,name:"Artista Exemplo",character:"A protagonista"}]}}));
  else if(url.pathname==="/3/collection/555")res.end(JSON.stringify({parts:[film,{...film,id:778,title:"Continuação",release_date:"2025-02-01"},{...film,id:779,adult:true}]}));
  else if(url.pathname==="/3/tv/777/season/0")res.end(JSON.stringify({episodes:[{episode_number:1,name:"OVA: O reencontro",air_date:"2025-06-01"},{episode_number:2,name:"Especial de inverno",air_date:null}]}));
  else if(url.pathname==="/3/person/20")res.end(JSON.stringify({name:"Diretora Exemplo",profile_path:"/example.jpg",biography:"Biografia de teste",combined_credits:{
    cast:[{...series,media_type:"tv",character:"Narradora"}],
    crew:["Director","Producer"].map(job=>({...film,media_type:"movie",job}))
  }}));
  else if(url.pathname==="/3/tv/777")res.end(JSON.stringify({...series,number_of_seasons:2,number_of_episodes:24,seasons:[{season_number:0,episode_count:2}],created_by:[{id:22,name:"Criadora Exemplo"}],aggregate_credits:{crew:[{id:22,name:"Criadora Exemplo",jobs:[{job:"Executive Producer"}]}]}}));
  else {res.statusCode=404;res.end("{}");}
});
function start(command, args, env, cwd) {
  const child = spawn(command,args,{cwd,env:{...process.env,...env},stdio:["ignore","pipe","pipe"]});
  children.push(child);
  child.stdout.on("data",chunk=>{child.log=(child.log??"")+chunk;});
  child.stderr.on("data",chunk=>{child.log=(child.log??"")+chunk;});
  child.on("error",error=>{child.log=String(error);});
  return child;
}
async function ready(url,child) {
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)break;
    if(await fetch(url).then(r=>r.ok,()=>false))return;
    await delay(400);
  }
  throw new Error("Servidor indisponível: "+url+"\n"+(child.log??""));
}
async function request(base,path,{method="GET",body,user=actor,idem,expected=200,authorized=true}={}) {
  const headers=authorized?{"X-Internal-Key":key,"X-Actor":user}:{};
  if(body!==undefined)headers["Content-Type"]="application/json";
  if(idem)headers["Idempotency-Key"]=idem;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  assert.equal(response.status,expected,method+" "+path+" "+text);
  return text?JSON.parse(text):null;
}
try {
  const db=name=>"jdbc:h2:mem:"+name+";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
  const database=(name)=>({
    DATABASE_URL:previewHost||useTls?db(name):process.env["SMOKE_"+name.toUpperCase()+"_JDBC"]??db(name),
    DATABASE_USER:previewHost||useTls?"sa":process.env.SMOKE_DB_USER??"sa",
    DATABASE_PASSWORD:previewHost||useTls?"":process.env.SMOKE_DB_PASSWORD??"",
    BIND_ADDRESS:"127.0.0.1",
  });
  const cat=start("java",["-jar","services/catalog/target/catalog-0.1.0-alpha.jar"],{...database("catalog"),PORT:"19181",INTERNAL_SECRET:key,TMDB_TOKEN:""});
  const soc=start("java",["-jar","services/social/target/social-0.1.0-alpha.jar"],{...database("social"),PORT:"19182",INTERNAL_SECRET:key,CATALOG_INTERNAL_SECRET:key,CATALOG_URL:catalog,INVITE_ONLY:"true",INVITED_EMAILS:email.toUpperCase(),EMAIL_MODE:"log",FRONTEND_URL:"http://127.0.0.1:19180"});
  await Promise.all([ready(catalog+"/health",cat),ready(social+"/health",soc)]);
  await request(catalog,"/titles",{authorized:false,expected:401});
  const anime=await request(catalog,"/titles?type=anime");
  assert.deepEqual(anime.items.map(item=>item.format).sort(),["movie","tv"]);
  assert.equal((await request(catalog,"/titles?query=mare")).items[0].id,"demo-mare-alta");
  await new Promise((resolve,reject)=>{mock.once("error",reject);mock.listen(0,"127.0.0.1",resolve);});
  const realMode="http://127.0.0.1:19183";
  const tmdb=start("java",["-jar","services/catalog/target/catalog-0.1.0-alpha.jar",
    "--tmdb.api-base=http://127.0.0.1:"+mock.address().port+"/3"],{...database("catalog"),PORT:"19183",INTERNAL_SECRET:key,TMDB_TOKEN:"fake-smoke-token"});
  await ready(realMode+"/health",tmdb);
  const search=await request(realMode,"/titles?type=movie&query=Cidade%20de%20Deus");
  assert.equal(search.demo,false);
  assert.equal(search.items[0].id,"tmdb-movie-777");
  assert.equal(search.hasMore,true);
  assert.equal(mockCalls.at(-1).searchParams.get("query"),"Cidade de Deus");
  const searchBatch=await request(realMode,"/title-batch?ids=tmdb-movie-777");
  assert.equal(searchBatch.length,1,"Filme encontrado na busca desaparece do perfil antes de abrir o card.");
  assert.equal(searchBatch[0].name,search.items[0].name);
  assert.equal(searchBatch[0].poster,search.items[0].poster);
  const beforeFilter=mockCalls.length;
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-777&genres=35,18")).length,1);
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-777&genre=35")).length,0);
  assert.equal(mockCalls.length,beforeFilter,"Gêneros da busca devem dispensar consultas de detalhes.");
  await request(realMode,"/titles?type=movie&query=sem-generos");
  const beforeFallback=mockCalls.length;
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-800&genre=18")).length,1);
  assert.equal(mockCalls.length,beforeFallback+1);
  assert.equal(mockCalls.at(-1).pathname,"/3/movie/800");
  const coldBatch=await request(realMode,"/title-batch?ids=tmdb-tv-777");
  assert.equal(coldBatch.length,1,"Título salvo sem cache precisa ser resolvido no lote.");
  const externalAnime=await request(realMode,"/titles?type=anime");
  assert.equal(externalAnime.items[0].id,"tmdb-tv-777");
  assert.equal(mockCalls.at(-1).searchParams.get("with_genres"),"16");
  const film=await request(realMode,"/titles/tmdb-movie-777");
  assert.match(film.poster,/image\.tmdb\.org/);
  assert.equal(mockCalls.at(-1).searchParams.get("append_to_response"),"credits");
  assert.deepEqual(film.details,{genres:["Drama"],runtime:124,seasons:null,episodes:null,directors:["Diretora Exemplo"],creators:[],cast:["Artista Exemplo"],people:[
    {id:21,name:"Artista Exemplo",photo:null,roles:["A protagonista"],castMember:true},
    {id:20,name:"Diretora Exemplo",photo:"https://image.tmdb.org/t/p/w185/example.jpg",roles:["Director"],castMember:false}
  ]});
  const seriesDetail=await request(realMode,"/titles/tmdb-tv-777");
  assert.equal(seriesDetail.details.episodes,24);
  assert.equal(seriesDetail.details.seasons,2);
  assert.deepEqual(seriesDetail.details.creators,["Criadora Exemplo"]);
  assert.deepEqual(seriesDetail.details.people[0].roles,["Creator","Executive Producer"]);
  const person=await request(realMode,"/people/20");
  assert.deepEqual(person.works.map(work=>work.poster),[null,"https://image.tmdb.org/t/p/w185/example.jpg"]);
  assert.equal(person.biography,"Biografia de teste");
  assert.deepEqual(person.works.map(work=>[work.id,work.roles]),[["tmdb-tv-777",["Narradora"]],["tmdb-movie-777",["Director","Producer"]]]);
  await request(realMode,"/people/20",{authorized:false,expected:401});
  const chronology=await request(realMode,"/chronology/tmdb-movie-777");
  assert.deepEqual(chronology.map(item=>item.work),["tmdb-movie-777","tmdb-movie-778"]);
  const specials=await request(realMode,"/chronology/tmdb-tv-777");
  assert.deepEqual(specials.map(item=>item.kind),["Série","OVA","Especial"]);
  assert.equal(specials[2].date,"");
  await request(realMode,"/chronology/tmdb-tv-777",{authorized:false,expected:401});
  const calls=mockCalls.length;
  assert.deepEqual(await request(realMode,"/titles/tmdb-movie-777"),film);
  assert.equal(mockCalls.length,calls);
  await request(realMode,"/titles?type=movie&query=limite",{expected:503});
  const suggestions=await request(realMode,"/suggestions",{method:"POST",body:{exclude:[],watched:[],liked:[],page:1}});
  assert.deepEqual(suggestions.items.map(t=>t.id),["tmdb-movie-777"],"Sugestões devem remover adultos, futuros e duplicados.");
  assert.equal(suggestions.nextPage,3);
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-777&genre=18")).length,1);
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-777&genre=35")).length,0);
  await request(realMode,"/suggestions",{method:"POST",body:{exclude:[],watched:[],liked:[],page:1,genre:18}});
  assert.equal(mockCalls.at(-1).searchParams.get("with_genres"),"18");
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-777&genres=35,18")).length,1);
  assert.equal((await request(realMode,"/title-batch?ids=tmdb-movie-777&genres=35,28")).length,0);
  await request(realMode,"/title-batch?ids=tmdb-movie-777&genres=999",{expected:400});
  await request(realMode,"/suggestions",{method:"POST",body:{exclude:[],watched:[],liked:[],page:1,genres:[18,35]}});
  assert.equal(mockCalls.at(-1).searchParams.get("with_genres"),"18|35");
  for(const [type,expected] of [["all",["tmdb-movie-777","tmdb-tv-777"]],["tv",["tmdb-tv-777"]],["anime",["tmdb-tv-777"]]]){
    const page=await request(realMode,"/suggestions",{method:"POST",body:{exclude:[],watched:[],liked:[],page:1,type}});
    assert.deepEqual(page.items.map(t=>t.id).sort(),expected);
  }
  const exhausted=await request(realMode,"/suggestions",{method:"POST",body:{exclude:["tmdb-movie-777"],watched:[],liked:[],page:3}});
  assert.equal(exhausted.items.length,0,"Sugestões não podem repetir filmes da sala.");
  console.log("TMDB simulado verificado: token, PT-BR, busca, anime, detalhes, persistência e limite de consultas.");
  const avatar="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwChAI8Tv//Z";
  const profile=(user,username,body,expected=200)=>request(social,"/me/profile",{user,method:"PUT",body:{username,name:"Testador",bio:"",...body},expected});
  await profile(actor,"testador",{});
  await profile(actor,"testador",{cpf:"campo legado ignorado"});
  await profile(actor,"testador",{avatar:"data:image/jpeg;base64,YQ=="},400);
  await profile(actor,"testador",{avatar});
  await profile("demo_second_user","testador",{},409);
  await profile("demo_second_user","segundo",{});
  const episodePath="/me/episodes/demo-mare-alta/1";
  assert.equal((await request(catalog,"/titles/demo-mare-alta/seasons/1"))[0].number,1);
  await request(social,"/me/library/demo-mare-alta/interest",{method:"PUT",body:{value:true}});
  await request(social,episodePath+"/1",{method:"PUT",body:{rating:7}});
  const ratedSeries=(await request(social,"/me")).library.find(item=>item.title==="demo-mare-alta");
  assert.equal(ratedSeries.watched,true);
  assert.equal(ratedSeries.interest,false);
  assert.equal((await request(social,episodePath))[0].rating,7);
  assert.deepEqual(await request(social,episodePath,{user:"demo_second_user"}),[]);
  const episodeId="ep-demo-mare-alta-s1-e1";
  assert.equal((await request(catalog,"/titles/"+episodeId)).name,"Piloto");
  const episodeEntry=(await request(social,"/me?title="+episodeId)).library.find(item=>item.title===episodeId);
  assert.equal(episodeEntry.rating,7);
  assert.equal(episodeEntry.watched,true);
  const changeEpisode=(action,body)=>request(social,"/me/library/"+episodeId+"/"+action,{method:"PUT",body});
  await changeEpisode("rating",{rating:8});
  assert.equal((await request(social,episodePath))[0].rating,8);
  await changeEpisode("rating",{rating:7});

  const seriesCommunity="/titles/demo-mare-alta/community";
  const seriesVisibility="/me/library/demo-mare-alta/visibility";
  assert.equal(ratedSeries.evaluation_public,true);assert.equal(ratedSeries.spoiler,false);
  assert.equal((await request(social,seriesCommunity)).average,3.5);
  await changeEpisode("visibility",{value:false});
  assert.equal((await request(social,"/titles/"+episodeId+"/community")).average,null);
  assert.equal((await request(social,seriesCommunity)).average,null);
  await changeEpisode("visibility",{value:true});
  await request(social,seriesVisibility,{method:"PUT",body:{value:false}});
  assert.equal((await request(social,seriesCommunity)).average,null);
  await request(social,seriesVisibility,{method:"PUT",body:{value:true}});
  await request(social,episodePath+"/2",{method:"PUT",body:{rating:9}});
  await request(social,episodePath+"/1",{method:"PUT",user:"demo_second_user",body:{rating:10}});
  await request(social,seriesVisibility,{method:"PUT",user:"demo_second_user",body:{value:false}});
  assert.deepEqual(await request(social,seriesCommunity),{rating_count:1,episode_rating_count:2,average:4,seasons:[{season:1,average:4}],reviews:[]});
  await request(social,seriesVisibility,{method:"PUT",user:"demo_second_user",body:{value:true}});
  const seriesStats=await request(social,seriesCommunity);
  assert.equal(seriesStats.rating_count,2);
  assert.equal(seriesStats.episode_rating_count,3);
  assert.ok(Math.abs(seriesStats.average-13/3)<0.0001);
  const laterEpisode="/me/episodes/demo-mare-alta/2/1";
  await request(social,laterEpisode,{method:"PUT",body:{rating:2}});
  const twoSeasons=await request(social,seriesCommunity);
  assert.ok(Math.abs(twoSeasons.average-(13/3+1)/2)<0.0001);
  assert.equal(twoSeasons.rating_count,2);
  assert.equal(twoSeasons.seasons[1].average,1);
  assert.deepEqual(await request(social,"/me/episodes/demo-mare-alta"),[{season:1,average:4},{season:2,average:1}]);
  await request(social,"/me/library/demo-mare-alta/rating",{method:"PUT",body:{rating:10},expected:400});
  await request(social,laterEpisode,{method:"PUT",body:{rating:null}});
  await request(social,seriesVisibility,{method:"PUT",body:{value:false}});
  await request(social,episodePath+"/2",{method:"PUT",body:{rating:null}});
  await request(social,episodePath+"/1",{method:"PUT",body:{rating:11},expected:400});
  await request(social,episodePath+"/999",{method:"PUT",body:{rating:5},expected:404});
  await request(social,episodePath+"/1",{method:"PUT",body:{rating:null}});
  assert.deepEqual(await request(social,episodePath),[]);
  await request(social,"/me/library/"+title+"/interest",{method:"PUT",body:{value:true}});
  const change=(action,body,expected=200)=>request(social,"/me/library/"+title+"/"+action,{method:"PUT",body,expected});
  assert.equal((await change("rating",{rating:7})).interest,false);
  await change("interest",{value:true},409);
  await change("watched",{value:false});
  await change("interest",{value:true});
  const ratedAgain=await change("rating",{rating:8});
  assert.equal(ratedAgain.watched,true);
  assert.equal(ratedAgain.interest,false);
  await change("rating",{rating:11},400);
  const rewatch=await change("rewatching",{value:true});
  assert.equal(rewatch.rewatching,true);
  assert.equal(rewatch.watched,true);
  assert.equal(rewatch.interest,false);
  assert.equal((await change("rewatching",{value:false})).rewatching,false);
  const initialRanking=await request(social,"/me/ranking");
  assert.deepEqual(initialRanking.items,[]);
  const ranked=await request(social,"/me/ranking",{method:"PUT",body:{version:0,items:[{title,tier:0}]}});
  assert.deepEqual(await request(social,"/me/ranking",{method:"PUT",body:{version:0,items:[{title,tier:0}]}}),ranked);
  assert.equal(ranked.items[0].title,title);
  await request(social,"/me/ranking",{method:"PUT",body:{version:0,items:[]},expected:409});
  await request(social,"/me/ranking",{method:"PUT",body:{version:ranked.version,items:[{title,tier:8}]},expected:400});
  await request(social,"/me/library/demo-mare-alta/watched",{method:"PUT",body:{value:true}});
  const seriesRank="/me/ranking/demo-mare-alta";
  const mixed=await request(social,seriesRank,{method:"PUT",body:{tier:0}});
  assert.deepEqual(mixed.items,[{title,tier:0},{title:"demo-mare-alta",tier:0}]);
  const reordered=await request(social,"/me/ranking",{method:"PUT",body:{version:mixed.version,items:[...mixed.items].reverse()}});
  assert.deepEqual(reordered.items,[...mixed.items].reverse());
  await request(social,seriesRank,{method:"PUT",body:{tier:-1}});
  assert.deepEqual((await request(social,"/me/ranking")).items,[{title,tier:0}]);
  assert.deepEqual((await request(social,"/me/ranking",{user:"demo_second_user"})).items,[]);
  await change("watched",{value:false});
  assert.deepEqual((await request(social,"/me/ranking")).items,[]);
  await change("watched",{value:true});
  const viewing={method:"POST",body:{title,date:"2024-01-01",rewatch:true},idem:"viewing-test-1"};
  await request(social,"/me/viewings",{...viewing,expected:409});
  await change("review",{version:0,review:"   ",spoiler:false});
  const watchedSessions=(await request(social,"/me")).viewings.filter(v=>v.title===title);
  assert.equal(watchedSessions.length,1,"Já vi deve criar só a primeira sessão, mesmo em cliques repetidos.");
  const savedReview=await change("review",{version:1,review:"Final fictício",spoiler:true});
  assert.deepEqual(await change("review",{version:1,review:"Final fictício",spoiler:true}),savedReview);
  await change("review",{version:0,review:"Sobrescrita",spoiler:false},409);
  await change("review",{version:2,review:"Final fictício revisado",spoiler:true});
  const communityPath="/titles/"+title+"/community";
  assert.equal((await request(social,communityPath)).rating_count,1);
  await change("visibility",{value:false});
  assert.deepEqual(await request(social,communityPath),{rating_count:0,average:null,reviews:[]});
  const privateProfile=await request(social,"/profiles/testador",{user:"demo_second_user"});
  const privateEntry=privateProfile.library.find(item=>item.title===title);
  assert.equal(privateEntry.rating,null);
  assert.equal(privateEntry.review,null);
  await change("visibility",{value:true});
  const community=await request(social,communityPath,{user:"demo_second_user"});
  assert.equal(community.average,4);
  assert.equal(community.rating_count,1);
  assert.equal(community.reviews[0].spoiler,true);
  assert.equal((await request(social,"/titles/"+title+"/reviews")).length,1);
  await change("visibility",{value:false});
  assert.deepEqual(await request(social,communityPath),{rating_count:0,average:null,reviews:[]});
  const [initialViewing,...extraViewings]=(await request(social,"/me")).viewings.filter(v=>v.title===title);
  assert.equal(extraViewings.length,0);
  assert.equal(initialViewing.title,title);
  assert.equal(initialViewing.rewatch,false);
  assert.ok(Date.now()-Date.parse(initialViewing.watched_at)<60_000);
  await change("rewatching",{value:true});
  await request(social,"/me/viewings",{...viewing,body:{...viewing.body,rewatch:false},expected:409});
  const first=await request(social,"/me/viewings",viewing);
  assert.deepEqual(await request(social,"/me/viewings",viewing),first);
  await request(social,"/me/viewings",{...viewing,body:{...viewing.body,date:"2024-01-02"},expected:409});
  const watchedAt="2024-01-02T01:15:00Z";
  await request(social,"/me/viewings",{...viewing,body:{title,watchedAt,rewatch:true},idem:"viewing-test-2"});
  await request(social,"/me/viewings/"+first.id,{method:"DELETE",user:"demo_second_user",expected:404});
  await request(social,"/me/viewings/"+first.id,{method:"DELETE"});
  const me=await request(social,"/me");
  const filmViewings=me.viewings.filter(v=>v.title===title);
  assert.equal(filmViewings.length,2);
  assert.equal(filmViewings[0].id,initialViewing.id);
  assert.equal(filmViewings[1].watched_on,"2024-01-01");
  assert.equal(new Date(filmViewings[1].watched_at).toISOString(),new Date(watchedAt).toISOString());
  assert.equal(filmViewings[1].rewatch,true);
  assert.equal(me.library[0].rating,8);
  assert.equal("lists" in me,false);
  const publicProfile=await request(social,"/profiles/testador",{user:"demo_second_user"});
  assert.deepEqual(publicProfile.viewings,[]);
  await request(social,"/diary?username=testador&page=2",{user:"demo_second_user",expected:403});
  await request(social,"/diary?page=0",{expected:400});
  const expectedSessions=new Set(me.viewings.map(item=>item.id));
  for(let i=0;i<100;i++){
    const result=await request(social,"/me/viewings",{...viewing,idem:"paged-diary-"+i});
    expectedSessions.add(result.id);
  }
  const pagedProfile=await request(social,"/me");
  assert.equal(pagedProfile.diaryHasMore,true);
  const collected=pagedProfile.viewings.map(item=>item.id);
  for(let page=2;page<=5;page++){
    const result=await request(social,"/diary?page="+page);
    collected.push(...result.items.map(item=>item.id));
    assert.equal(result.hasMore,page<5);
  }
  assert.equal(collected.length,expectedSessions.size);
  assert.deepEqual(new Set(collected),expectedSessions);
  assert.deepEqual(await request(social,"/diary?page=1&title=demo-ultimo-rolo"),{items:[],hasMore:false});
  const titleHistory=await request(social,"/diary?page=5&title="+title);
  assert.ok(titleHistory.items.length&&titleHistory.items.every(item=>item.title===title));
  await request(social,"/diary?page=1&username=testador&title="+title,{user:"demo_second_user",expected:403});
  assert.deepEqual(await request(social,"/diary?page=6"),{items:[],hasMore:false});

  assert.match(publicProfile.profile.avatar,/^data:image\/jpeg;base64,/);
  assert.equal("cpf" in publicProfile.profile,false);
  assert.equal("cpf" in (await request(social,"/me")).profile,false);
  await profile(actor,"testador",{avatar:"preset:cinema"});
  assert.equal((await request(social,"/profiles/testador",{user:"demo_second_user"})).profile.avatar,"preset:cinema");
  await profile(actor,"testador",{avatar:"preset:inexistente"},400);
  await profile(actor,"testador",{avatar:""});
  assert.equal((await request(social,"/me")).profile.avatar,"");
  assert.equal(publicProfile.library[0].interest,false);
  console.log("APIs verificadas: autenticação interna, catálogo, interesse, notas, resenhas, diário, idempotência, propriedade e privacidade.");

  const app=start(process.execPath,["node_modules/next/dist/bin/next","start","--port","19180","--hostname",useTls?"127.0.0.1":webHost],{
    CATALOG_URL:catalog,SOCIAL_URL:social,NEXTAUTH_URL:web,NEXTAUTH_SECRET:randomUUID(),
    OIDC_ISSUER:"",EMAIL_ACCOUNTS:"true",SOCIAL_INTERNAL_SECRET:key,CATALOG_INTERNAL_SECRET:key,
  },"apps/web");
  if(tlsPreview)await new Promise((resolve,reject)=>{
    tlsPreview.once("error",reject);
    tlsPreview.listen(19443,webHost,resolve);
  });
  await ready(web,app);
  const landing=await (await fetch(web)).text();
  assert.match(landing,/Seu diário de/);
  assert.match(landing,/Criar conta/);
  assert.match(landing,/Dê sua nota, conte sua história/);
  assert.doesNotMatch(landing,/Experimentar demonstração/);
  const providers=await (await fetch(web+"/api/auth/providers")).json();
  assert.deepEqual(Object.keys(providers),["email-account"]);
  for(const path of ["me","titles?type=anime"]) {
    assert.equal((await fetch(web+"/api/v1/"+path)).status,401);
  }

  const password=randomUUID()+"!Aa1";
  const newPassword=randomUUID()+"!Bb2";
  async function emailSignIn(fields,{rawCookie=false}={}) {
    const csrf=await fetch(web+"/api/auth/csrf");
    const csrfCookie=csrf.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
    const {csrfToken}=await csrf.json();
    const response=await fetch(web+"/api/auth/callback/email-account",{method:"POST",redirect:"manual",
      headers:{Cookie:csrfCookie,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken,callbackUrl:web,json:"true",...fields})});
    const cookie=response.headers.getSetCookie().find(value=>value.includes("session-token="));
    return rawCookie?cookie:cookie?.split(";")[0];
  }
  async function link(purpose) {
    const response=await fetch(web+"/api/accounts/"+purpose,{method:"POST",headers:{Origin:web,"Content-Type":"application/json"},body:JSON.stringify({email})});
    assert.equal(response.status,202);
    for(let i=0;i<30;i++){
      const match=(soc.log??"").match(new RegExp("#"+purpose+"=([A-Za-z0-9_-]{43})"));
      if(match)return match[1];
      await delay(100);
    }
    assert.fail("Link de e-mail de teste não gerado.");
  }
  assert.match(await (await fetch(web)).text(),/Criar conta/);
  const outsiderRequest=await fetch(web+"/api/accounts/register",{method:"POST",headers:{Origin:web,"Content-Type":"application/json"},body:JSON.stringify({email:"outsider@example.test"})});
  assert.equal(outsiderRequest.status,202);
  const deniedMessage=await outsiderRequest.json();
  assert.equal((soc.log??"").includes("#register="),false,"Endereço não convidado recebeu link.");
  const missingReset=await fetch(web+"/api/accounts/reset",{method:"POST",headers:{Origin:web,"Content-Type":"application/json"},body:JSON.stringify({email})});
  assert.equal(missingReset.status,202);
  assert.deepEqual(await missingReset.json(),{message:"Link de recuperação enviado. Confira também a pasta de spam.",retryAfterSeconds:120});
  assert.equal((soc.log??"").includes("#reset="),false,"Endereço sem conta recebeu link de recuperação.");
  const token=await link("register");
  const repeated=await fetch(web+"/api/accounts/register",{method:"POST",headers:{Origin:web,"Content-Type":"application/json"},body:JSON.stringify({email})});
  assert.equal(repeated.status,202);
  assert.deepEqual(await repeated.json(),deniedMessage,"Resposta revela a lista de convidados.");
  assert.equal(await emailSignIn({email,password}),undefined);
  assert.equal(await emailSignIn({purpose:"register",token,password:"curta"}),undefined);
  const account=await emailSignIn({purpose:"register",token,password});
  assert.ok(account,"Sessão após confirmação não criada.");
  assert.equal(await emailSignIn({purpose:"register",token,password}),undefined);
  const accountHeaders={Cookie:account,Origin:web,"Content-Type":"application/json"};
  for(const path of ["/","/ranking","/obra/demo-lua-de-papel"]) {
    const gated=await fetch(web+path,{headers:accountHeaders,redirect:"manual"});
    assert.equal(gated.status,307);
    assert.equal(new URL(gated.headers.get("location"),web).pathname,"/conta/perfil");
  }
  const gatedApi=await fetch(web+"/api/v1/titles",{headers:accountHeaders});
  assert.equal(gatedApi.status,403);
  assert.equal((await gatedApi.json()).code,"PROFILE_REQUIRED");
  const ownProfile=await fetch(web+"/api/v1/me/profile",{method:"PUT",headers:accountHeaders,body:JSON.stringify({username:"conta_teste",name:"Conta teste",avatar})});
  assert.equal(ownProfile.status,200,await ownProfile.text());
  const csv=Buffer.from('Name,Year,Letterboxd URI\n"Filme simulado",2024,https://letterboxd.com/film/example/\n');
  const zipName=Buffer.from("watchlist.csv");
  let crc=0xffffffff;for(const byte of csv){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const zipHeader=Buffer.alloc(30);zipHeader.writeUInt32LE(0x04034b50,0);zipHeader.writeUInt16LE(20,4);zipHeader.writeUInt32LE(crc,14);zipHeader.writeUInt32LE(csv.length,18);zipHeader.writeUInt32LE(csv.length,22);zipHeader.writeUInt16LE(zipName.length,26);
  const zipBytes=Buffer.concat([zipHeader,zipName,csv]);
  const upload=new FormData();upload.set("file",new Blob([zipBytes],{type:"application/zip"}),"letterboxd.zip");
  const importedPreview=await fetch(web+"/api/importar/letterboxd/preview",{method:"POST",headers:{Cookie:account,Origin:web},body:upload});
  assert.equal(importedPreview.status,200,await importedPreview.clone().text());
  const previewRows=(await importedPreview.json()).rows;assert.equal(previewRows[0].name,"Filme simulado");
  const importBody=JSON.stringify({rows:previewRows.map(r=>({...r,title:"demo-lua-de-papel"}))});
  const importCommit=await fetch(web+"/api/importar/letterboxd/commit",{method:"POST",headers:accountHeaders,body:importBody});
  assert.equal(importCommit.status,200,await importCommit.clone().text());assert.equal((await importCommit.json()).imported,1);
  const importAgain=await fetch(web+"/api/importar/letterboxd/commit",{method:"POST",headers:accountHeaders,body:importBody});
  assert.equal((await importAgain.json()).skipped,1);
  const blockedImport=await fetch(web+"/api/importar/letterboxd/commit",{method:"POST",headers:{...accountHeaders,Origin:"https://example.com"},body:importBody});
  assert.equal(blockedImport.status,403);
  const feedbackId=randomUUID();
  const feedbackBody=JSON.stringify({id:feedbackId,kind:"bug",description:"Teste isolado de feedback",page:"/salas",version:"0.1.0-alpha"});
  const feedbackResponse=await fetch(web+"/api/v1/feedback",{method:"POST",headers:accountHeaders,body:feedbackBody});
  assert.equal(feedbackResponse.status,200,await feedbackResponse.clone().text());
  assert.equal((await fetch(web+"/api/v1/feedback",{headers:accountHeaders})).status,403);
  assert.equal((await fetch(web+"/api/v1/feedback/"+feedbackId,{method:"PUT",headers:accountHeaders,body:JSON.stringify({status:"resolved"})})).status,403);
  assert.equal((await (await fetch(web+"/api/v1/feedback/access",{headers:accountHeaders})).json()).admin,false);
  const roomCreate=await fetch(web+"/api/v1/rooms",{method:"POST",headers:accountHeaders,body:JSON.stringify({name:"Sessão de teste"})});
  assert.equal(roomCreate.status,200);
  const createdRoom=await roomCreate.json();
  const roomState=await fetch(web+"/api/v1/rooms/"+createdRoom.id,{headers:accountHeaders});
  assert.equal(roomState.status,200);
  assert.equal((await roomState.json()).status,"lobby");
  const roomPage=await fetch(web+"/salas?sala="+createdRoom.id,{headers:accountHeaders});
  assert.equal(roomPage.status,200);
  const savedAvatar=(await (await fetch(web+"/api/v1/me?summary=true",{headers:accountHeaders})).json()).profile.avatar;
  assert.match(savedAvatar,/^data:image\/jpeg;base64,/);
  for(const page of [roomPage,await fetch(web+"/salas",{headers:accountHeaders})]){
    const html=await page.text();
    const link=html.match(/<a[^>]+class="room-nav-button room-profile-link"[^>]*>[\s\S]*?<\/a>/)?.[0];
    assert.ok(link?.includes('src="'+savedAvatar+'"'),"Sélete deve mostrar o avatar da conta no cabeçalho.");
  }
  const roomVisitor=await fetch(web+"/salas?sala="+createdRoom.id,{redirect:"manual"});
  assert.equal(roomVisitor.status,307);
  assert.equal(new URL(roomVisitor.headers.get("location"),web).searchParams.get("next"),"/salas?sala="+createdRoom.id);
  const specialName="Maro fã / anime #1!";
  const specialProfile=await fetch(web+"/api/v1/me/profile",{method:"PUT",headers:accountHeaders,body:JSON.stringify({username:specialName,name:"Conta teste"})});
  assert.equal(specialProfile.status,200);
  const specialLookup=await fetch(web+"/api/v1/profiles?username="+encodeURIComponent(specialName),{headers:accountHeaders});
  assert.equal(specialLookup.status,200);
  assert.equal((await specialLookup.json()).profile.username,"maro fã / anime #1!");
  assert.equal((await fetch(web+"/api/v1/me/profile",{method:"PUT",headers:accountHeaders,body:JSON.stringify({username:"conta_teste",name:"Conta teste"})})).status,200);
  const result=await fetch(web+"/api/v1/titles?type=anime",{headers:accountHeaders});
  assert.equal(result.status,200);
  assert.equal((await result.json()).items.length,2);
  const denied=await fetch(web+"/api/v1/me/profile",{method:"PUT",headers:{...accountHeaders,Origin:"https://example.com"},body:"{}"});
  assert.equal(denied.status,403);
  const temporaryCookie=await emailSignIn({email,password},{rawCookie:true});
  assert.match(temporaryCookie,/HttpOnly/i);
  assert.doesNotMatch(temporaryCookie,/;\s*(?:Expires|Max-Age)=/i);
  const temporary=await fetch(web+"/api/auth/session",{headers:{Cookie:temporaryCookie.split(";")[0]}});
  assert.doesNotMatch(temporary.headers.getSetCookie().find(value=>value.includes("session-token=")),/;\s*(?:Expires|Max-Age)=/i);
  const temporaryAge=Date.parse((await temporary.json()).expires)-Date.now();
  assert.ok(temporaryAge>7*60*60*1000 && temporaryAge<=8*60*60*1000);

  const persistentCookie=await emailSignIn({email,password,rememberMe:"true"},{rawCookie:true});
  assert.match(persistentCookie,/HttpOnly/i);
  const expires=Date.parse(persistentCookie.match(/; Expires=([^;]+)/i)[1]);
  const persistentAge=expires-Date.now();
  assert.ok(persistentAge>29*24*60*60*1000 && persistentAge<=30*24*60*60*1000);
  const persistentHeaders={Cookie:persistentCookie.split(";")[0]};
  const persistent=await fetch(web+"/api/auth/session",{headers:persistentHeaders});
  assert.equal(Date.parse((await persistent.json()).expires),expires);
  const refreshed=persistent.headers.getSetCookie().find(value=>value.includes("session-token="));
  assert.equal(Date.parse(refreshed.match(/; Expires=([^;]+)/i)[1]),expires);
  const reset=await link("reset");
  const resetAgain=await fetch(web+"/api/accounts/reset",{method:"POST",headers:{Origin:web,"Content-Type":"application/json"},body:JSON.stringify({email})});
  assert.equal(resetAgain.status,429);
  assert.ok(Number(resetAgain.headers.get("Retry-After"))>0);
  assert.ok((await resetAgain.json()).retryAfterSeconds<=120);

  const updatedSession=await emailSignIn({purpose:"reset",token:reset,password:newPassword});
  assert.ok(updatedSession);
  assert.equal((await fetch(web+"/api/v1/me",{headers:accountHeaders})).status,401);
  assert.equal((await fetch(web+"/api/v1/me",{headers:persistentHeaders})).status,401);
  assert.equal(await emailSignIn({email,password}),undefined);
  const signed=await emailSignIn({email:email.toUpperCase(),password:newPassword});
  assert.ok(signed);
  const preserved=await fetch(web+"/api/v1/me",{headers:{Cookie:signed}});
  assert.equal((await preserved.json()).profile.username,"conta_teste");
  assert.equal((await fetch(web+"/obra/demo-lua-de-papel",{redirect:"manual"})).status,307);
  const dedicated=await fetch(web+"/obra/demo-lua-de-papel",{headers:{Cookie:signed}});
  assert.equal(dedicated.status,200);
  assert.match(await dedicated.text(),/Carregando detalhes da obra/);
  const finalHeaders={Cookie:signed,Origin:web,"Content-Type":"application/json"};
  const friendSearch=await fetch(web+"/api/v1/friends/search?q=testador",{headers:finalHeaders});
  assert.equal(friendSearch.status,200);
  assert((await friendSearch.json()).some(p=>p.username==="testador"));
  const friendRequest=await fetch(web+"/api/v1/friends",{method:"POST",headers:finalHeaders,body:JSON.stringify({username:"testador"})});
  assert.equal(friendRequest.status,200);const friendship=await friendRequest.json();
  const notifications=()=>request(social,"/notifications");
  const hasFriendRequest=async()=>(await notifications()).items.some(i=>i.kind==="friend"&&i.target==="conta_teste");
  assert(await hasFriendRequest());
  assert.equal((await fetch(web+"/api/v1/notifications")).status,401);
  const senderInbox=await fetch(web+"/api/v1/notifications",{headers:finalHeaders});
  assert.equal(senderInbox.status,200);assert(!(await senderInbox.json()).items.some(i=>i.target==="testador"&&i.kind==="friend"));
  await request(social,"/friends/"+friendship.id,{method:"PUT",user:"demo_second_user",body:{action:"accept"},expected:403});
  await request(social,"/friends/"+friendship.id,{method:"PUT",body:{action:"accept"}});
  const invitedRoom=await (await fetch(web+"/api/v1/rooms",{method:"POST",headers:finalHeaders,body:JSON.stringify({name:"Convite para amigos teste"})})).json();
  const roomFriends=await fetch(web+"/api/v1/rooms/"+invitedRoom.id+"/friends",{headers:finalHeaders});assert.equal(roomFriends.status,200);
  assert((await roomFriends.json()).items.some(p=>p.username==="testador"&&!p.joined&&!p.invited));
  const sendRoomInvite=()=>fetch(web+"/api/v1/rooms/"+invitedRoom.id+"/invite",{method:"POST",headers:finalHeaders,body:JSON.stringify({username:"testador"})});
  assert.equal((await sendRoomInvite()).status,200);assert.equal((await sendRoomInvite()).status,200);
  const roomNotices=async()=>(await notifications()).items.filter(i=>i.kind==="room"&&i.target===invitedRoom.id);
  assert(!(await hasFriendRequest()));assert.equal((await roomNotices()).length,1);
  assert((await request(social,"/rooms")).some(r=>r.id===invitedRoom.id&&r.invited));
  await request(social,"/rooms/"+invitedRoom.id,{expected:403});
  await request(social,"/rooms/"+invitedRoom.id+"/join",{method:"POST"});
  assert((await request(social,"/rooms")).some(r=>r.id===invitedRoom.id&&!r.invited));
  assert.equal((await roomNotices()).length,0);
  const lobbyExit=await request(social,"/rooms/"+invitedRoom.id+"/leave",{method:"POST"});
  assert.equal(lobbyExit.dissolved,false);
  const lobbyAfterExit=await (await fetch(web+"/api/v1/rooms/"+invitedRoom.id,{headers:finalHeaders})).json();
  assert.equal(lobbyAfterExit.status,"lobby");assert.equal(lobbyAfterExit.members.length,1);
  await request(social,"/rooms/"+invitedRoom.id+"/join",{method:"POST"});
  assert.equal((await fetch(web+"/api/v1/rooms/"+invitedRoom.id+"/start",{method:"POST",headers:finalHeaders})).status,200);
  const left=await request(social,"/rooms/"+invitedRoom.id+"/leave",{method:"POST"});
  assert(left.dissolved);
  const endedNotice=item=>item.kind==="closedByLeave"&&item.target===invitedRoom.id;
  assert((await notifications()).items.some(endedNotice));
  const ownerNotices=async()=>await (await fetch(web+"/api/v1/notifications",{headers:finalHeaders})).json();
  assert((await ownerNotices()).items.some(endedNotice));
  assert.equal((await fetch(web+"/api/v1/notifications/rooms/"+invitedRoom.id+"/read",{method:"PUT",headers:finalHeaders})).status,200);
  assert(!(await ownerNotices()).items.some(endedNotice));
  assert((await notifications()).items.some(endedNotice));
  const publicFriends=await fetch(web+"/api/v1/friends/profile?username=testador",{headers:finalHeaders});
  assert.equal(publicFriends.status,200);
  const publicFriendsData=await publicFriends.json();
  assert(publicFriendsData.items.some(p=>p.username==="conta_teste"));
  assert(publicFriendsData.items.every(p=>Object.keys(p).sort().join(",")==="avatar,name,username"));
  assert.equal((await fetch(web+"/api/v1/friends/profile?username=testador")).status,401);
  const friendList=await fetch(web+"/api/v1/friends",{headers:finalHeaders});
  assert((await friendList.json()).items.some(p=>p.username==="testador"&&p.relationship==="friends"));
  assert.equal((await fetch(web+"/api/v1/friends",{method:"POST",headers:{...finalHeaders,Origin:"https://example.com"},body:JSON.stringify({username:"segundo"})})).status,403);
  assert.equal((await fetch(web+"/api/v1/friends")).status,401);
  assert.equal((await fetch(web+"/api/v1/friends/"+friendship.id,{method:"PUT",headers:finalHeaders,body:JSON.stringify({action:"remove"})})).status,200);
  console.log("Amizades verificadas: busca, pedido, aceite, privacidade, autorização e remoção.");
  for(const [id,action,value] of [["demo-lua-de-papel","watched",true],["demo-ultimo-rolo","watched",true],["demo-fim-da-linha","interest",true]]) {
    const response=await fetch(web+"/api/v1/me/library/"+id+"/"+action,{method:"PUT",headers:finalHeaders,body:JSON.stringify({value})});
    assert.equal(response.status,200);
  }
  const savedRanking=await fetch(web+"/api/v1/me/ranking",{method:"PUT",headers:finalHeaders,body:JSON.stringify({version:0,items:[{title:"demo-lua-de-papel",tier:0}]})});
  assert.equal(savedRanking.status,200);
  assert.equal((await fetch(web+"/ranking",{redirect:"manual"})).status,307);
  const rankingPage=await fetch(web+"/ranking",{headers:finalHeaders});
  assert.equal(rankingPage.status,200);
  const updatedRank=await fetch(web+"/api/v1/me/ranking/demo-lua-de-papel",{
    method:"PUT",headers:finalHeaders,body:JSON.stringify({tier:1})
  });
  assert.equal(updatedRank.status,200);
  assert.deepEqual((await updatedRank.json()).items,[{title:"demo-lua-de-papel",tier:1}]);

  const retired=await fetch(web+"/api/v1/me/lists",{method:"POST",headers:finalHeaders,body:"{}"});
  assert.equal(retired.status,404);
  await request(social,"/me/visibility",{method:"PUT",body:{section:"lists",visible:true},expected:400});
  const visibilityUpdate=async(section,visible)=>{
    const r=await fetch(web+"/api/v1/me/visibility",{method:"PUT",headers:finalHeaders,body:JSON.stringify({section,visible})});assert.equal(r.status,200);
  };
  const visitor=()=>request(social,"/profiles?username=conta_teste");
  await visibilityUpdate("all",true);
  const shared=await visitor();
  assert(shared.library.some(i=>i.interest));assert(shared.library.some(i=>i.watched));assert(shared.ranking.length);assert(shared.viewings.length);assert.equal("lists" in shared,false);
  await visibilityUpdate("all",false);
  const hidden=await visitor();for(const field of ["library","ranking","viewings"])assert.deepEqual(hidden[field],[],field+" must be private");
  const hiddenLegacy=await request(social,"/profiles/conta_teste");assert.deepEqual(hiddenLegacy.library,[]);
  const ownHidden=await fetch(web+"/api/v1/me",{headers:finalHeaders});assert((await ownHidden.json()).library.length);
  await visibilityUpdate("watchlist",true);
  const onlyWatchlist=await visitor();assert(onlyWatchlist.library.some(i=>i.interest));assert(onlyWatchlist.library.every(i=>!i.watched&&i.rating===null&&i.review===null));assert.deepEqual(onlyWatchlist.ranking,[]);
  await visibilityUpdate("watchlist",false);await visibilityUpdate("ranking",true);
  const onlyRanking=await visitor();assert(onlyRanking.ranking.length);assert.deepEqual(onlyRanking.library,[]);
  await visibilityUpdate("ranking",false);await visibilityUpdate("diary",true);
  const publicDiary=await request(social,"/diary?page=1&username=conta_teste");
  const onlyDiary=await visitor();assert.deepEqual(publicDiary.items,onlyDiary.viewings);assert(onlyDiary.viewings.length);assert.deepEqual(onlyDiary.library,[]);
  await visibilityUpdate("all",false);await visibilityUpdate("watched",true);
  assert.equal((await fetch(web+"/api/v1/me/visibility",{method:"PUT",headers:finalHeaders,body:JSON.stringify({section:"actor",visible:true})})).status,400);
  console.log("Privacidade: seções filtradas na API, controle geral e acesso do proprietário verificados.");

  const episodePage=await fetch(web+"/obra/demo-mare-alta/episodios/1/1",{headers:finalHeaders,redirect:"manual"});
  assert.equal(episodePage.status,200);
  const episodeApi=async(path,method="GET",body)=>{
    const response=await fetch(web+"/api/v1/"+path,{method,headers:finalHeaders,body:JSON.stringify(body)});
    assert.equal(response.status,200,path);
    return response.json();
  };
  assert.equal((await episodeApi("titles/"+episodeId)).format,"ep");
  const episodeLibrary="me/library/"+episodeId+"/";
  await episodeApi(episodeLibrary+"watched","PUT",{value:true});
  await episodeApi(episodeLibrary+"rating","PUT",{rating:9});
  await episodeApi(episodeLibrary+"visibility","PUT",{value:true});
  await episodeApi(episodeLibrary+"review","PUT",{review:"Resenha do episódio.",version:0,spoiler:true});
  const episodeCommunity=await episodeApi("titles/"+episodeId+"/community");
  assert.equal(episodeCommunity.rating_count,2);
  assert.equal(episodeCommunity.average,4.75);
  assert.equal(episodeCommunity.reviews[0].spoiler,true);
  assert((await episodeApi("diary?page=1&title="+episodeId)).items.length);
  assert((await episodeApi("me/ranking/"+episodeId,"PUT",{tier:2})).items.some(item=>item.title===episodeId&&item.tier===2));
  console.log("Episódio: página autenticada, avaliação, resenha com spoiler, Diário e ranking verificados.");

  const roomResponse=await fetch(web+"/api/v1/rooms",{method:"POST",headers:finalHeaders,body:JSON.stringify({name:"Segunda rodada teste"})});assert.equal(roomResponse.status,200);
  const reconsiderRoom=(await roomResponse.json()).id;
  for(const user of [actor,"demo_second_user"])await request(social,"/rooms/"+reconsiderRoom+"/join",{method:"POST",user,body:{}});
  await request(social,"/me/library/demo-fim-da-linha/interest",{method:"PUT",body:{value:true}});
  assert.equal((await fetch(web+"/api/v1/rooms/"+reconsiderRoom+"/start",{method:"POST",headers:finalHeaders,body:"{}"})).status,200);
  for(const user of [actor,"demo_second_user"])await request(social,"/rooms/"+reconsiderRoom+"/votes/demo-fim-da-linha",{method:"PUT",user,body:{liked:true}});
  assert.equal((await fetch(web+"/api/v1/rooms/"+reconsiderRoom+"/votes/demo-fim-da-linha",{method:"PUT",headers:finalHeaders,body:JSON.stringify({liked:false})})).status,200);
  const proposalState=await fetch(web+"/api/v1/rooms/"+reconsiderRoom,{headers:finalHeaders});const proposal=(await proposalState.json()).reconsiderations;assert.equal(proposal.length,1);assert.equal(proposal[0].supporters.length,2);
  if(process.env.SMOKE_PREVIEW!=="true"){
    assert.equal((await fetch(web+"/api/v1/rooms/"+reconsiderRoom+"/reconsider/demo-fim-da-linha",{method:"PUT",headers:finalHeaders,body:JSON.stringify({liked:true})})).status,200);
    const agreed=await fetch(web+"/api/v1/rooms/"+reconsiderRoom,{headers:finalHeaders});assert((await agreed.json()).matches.includes("demo-fim-da-linha"));
  }
  const reviewAuthor="demo_spoiler_author", authorName="critico";
  await profile(reviewAuthor,authorName,{});
  const reviewUrl="/me/library/"+title+"/review";
  const reviewBody={version:0,review:"Resenha da votação de teste",spoiler:false};
  const published=await request(social,reviewUrl,{user:reviewAuthor,method:"PUT",body:reviewBody});
  const ballot=(user,containsSpoiler,expected=200)=>request(social,"/titles/"+title+"/spoiler-vote",
    {method:"PUT",user,expected,body:{username:authorName,version:published.version,containsSpoiler}});
  await ballot(reviewAuthor,true,403);
  const reportPath="/titles/"+title+"/review-report";
  const reportBody={username:authorName,version:published.version,reason:"spam",details:""};
  await request(social,reportPath,{method:"POST",user:reviewAuthor,body:reportBody,expected:403});
  await request(social,reportPath,{method:"POST",body:{...reportBody,reason:"other"},expected:400});
  const report=await fetch(web+"/api/v1"+reportPath,{method:"POST",headers:finalHeaders,body:JSON.stringify(reportBody)});
  assert.equal(report.status,200);
  assert.deepEqual(await report.json(),{reported:true});
  assert.deepEqual(await request(social,reportPath,{method:"POST",user:"demo_second_user",body:reportBody}),{reported:true});
  assert.deepEqual(await request(social,reportPath,{method:"POST",user:"demo_second_user",body:reportBody}),{reported:true});
  assert.equal((await fetch(web+"/api/v1/feedback/review-reports",{headers:finalHeaders})).status,403);
  assert.equal((await ballot(actor,true)).spoiler,false);
  assert.equal((await ballot(actor,true)).spoiler,false);
  assert.equal((await ballot("demo_second_user",true)).spoiler,true);
  const visitorPage=()=>request(social,"/library-page?section=watched&page=1&username="+authorName,{user:actor});
  const classified=(await visitorPage()).items.find(i=>i.title===title);
  assert.equal(classified.spoiler,true);assert.equal(classified.my_vote,true);
  assert.equal(classified.viewer_watched,(await request(social,"/me")).library.find(i=>i.title===title).watched);
  assert.equal((await ballot("demo_second_user",false)).spoiler,false);
  await request(social,reviewUrl,{user:reviewAuthor,method:"PUT",body:{version:published.version,review:"Texto atualizado",spoiler:false}});
  await ballot(actor,true,409);
  await request(social,reportPath,{method:"POST",body:reportBody,expected:409});
  const revised=(await request(social,communityPath)).reviews.find(r=>r.username===authorName);
  assert.equal(revised.my_vote,null);assert.equal(revised.spoiler,false);
  await request(social,"/me/library/"+title+"/visibility",{user:reviewAuthor,method:"PUT",body:{value:false}});
  await ballot(actor,true,404);
  console.log("Segunda rodada: maioria e identificação dos apoiadores verificadas pela API autenticada.");
  console.log("Página individual e ranking por usuário com persistência e controle de versão verificados.");
  console.log("Cadastro por e-mail, perfil sem CPF e com foto, link de uso único e recuperação verificados.");
  if(process.env.SMOKE_PREVIEW==="true") {
    if(previewHost||useTls) {
      const watched=await fetch(web+"/api/v1/me/library/demo-fim-da-linha/watched",{
        method:"PUT",headers:finalHeaders,body:JSON.stringify({value:true})
      });
      assert.equal(watched.status,200);
      for(const id of ["demo-ultimo-rolo","demo-fim-da-linha"]) {
        const ranked=await fetch(web+"/api/v1/me/ranking/"+id,{
          method:"PUT",headers:finalHeaders,body:JSON.stringify({tier:0})
        });
        assert.equal(ranked.status,200);
      }
    }
    console.log("Prévia isolada em "+web+" | E-mail fictício: "+email+" | Senha de teste: "+newPassword);
    await new Promise(resolve=>{process.once("SIGINT",resolve);process.once("SIGTERM",resolve);});
  }
} finally {
  for(const child of children)child.kill();
  mock.close();
  tlsPreview?.close();
}
