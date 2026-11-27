import {spawn} from "node:child_process";
import {randomBytes,randomUUID} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {parseEnv} from "node:util";
const settingsFile=new URL("../.env",import.meta.url);
const localSettings=existsSync(settingsFile)?parseEnv(readFileSync(settingsFile,"utf8")):{};
function localSessionSecret() {
  const configured=process.env.NEXTAUTH_SECRET?.trim()||localSettings.NEXTAUTH_SECRET?.trim();
  if(configured)return configured;
  const directory=new URL("../data/",import.meta.url);
  const file=new URL("nextauth-secret",directory);
  mkdirSync(directory,{recursive:true});
  if(!existsSync(file)) {
    try {writeFileSync(file,randomBytes(32).toString("base64url"),{flag:"wx",mode:0o600});}
    catch(error) {if(error.code!=="EEXIST")throw error;}
  }
  const saved=readFileSync(file,"utf8").trim();
  if(saved.length<32)throw new Error("A chave de sessão local está inválida.");
  return saved;
}
const sessionSecret=localSessionSecret();
const tmdbToken=(process.env.TMDB_TOKEN??localSettings.TMDB_TOKEN??"").trim();
const catalogKey=randomUUID();
const socialKey=randomUUID();
const running=[];
const mailKeys=["INVITE_ONLY","INVITED_EMAILS","EMAIL_MODE","FRONTEND_URL","SMTP_HOST","SMTP_PORT","SMTP_USERNAME","SMTP_PASSWORD","SMTP_AUTH","SMTP_STARTTLS","MAIL_FROM"];
const mailEnvironment=Object.fromEntries(mailKeys.map(key=>[key,process.env[key]??localSettings[key]??""]).filter(([,value])=>value!==""));
const sharedEnvironment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!["TMDB_TOKEN","NEXTAUTH_SECRET","GOOGLE_CLIENT_SECRET"].includes(key)&&!mailKeys.includes(key)));
function start(command,args,env,cwd) {
  const child=spawn(command,args,{cwd,env:{...sharedEnvironment,...env},stdio:"inherit"});
  running.push(child);
  child.on("exit",code=>stop(code??1));
  child.on("error",error=>{console.error(error.message);stop(1);});
}
let stopping=false;
function stop(code) {
  if(stopping)return;
  stopping=true;
  for(const child of running)child.kill();
  process.exitCode=code;
}
process.on("SIGINT",()=>stop(0));
process.on("SIGTERM",()=>stop(0));
start("java",["-jar","services/catalog/target/catalog-0.1.0-alpha.jar"],{PORT:"8181",BIND_ADDRESS:"127.0.0.1",INTERNAL_SECRET:catalogKey,TMDB_TOKEN:tmdbToken});
start("java",["-jar","services/social/target/social-0.1.0-alpha.jar"],{PORT:"8182",BIND_ADDRESS:"127.0.0.1",INTERNAL_SECRET:socialKey,CATALOG_INTERNAL_SECRET:catalogKey,CATALOG_URL:"http://127.0.0.1:8181",EMAIL_MODE:"log",...mailEnvironment});
start(process.execPath,["node_modules/next/dist/bin/next","start","--port","3000","--hostname","127.0.0.1"],{
  NEXTAUTH_URL:"http://localhost:3000",NEXTAUTH_SECRET:sessionSecret,
  OIDC_ISSUER:"",GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID??localSettings.GOOGLE_CLIENT_ID??"",GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET??localSettings.GOOGLE_CLIENT_SECRET??"",EMAIL_ACCOUNTS:process.env.EMAIL_ACCOUNTS??localSettings.EMAIL_ACCOUNTS??"true",CATALOG_URL:"http://127.0.0.1:8181",SOCIAL_URL:"http://127.0.0.1:8182",
  CATALOG_INTERNAL_SECRET:catalogKey,SOCIAL_INTERNAL_SECRET:socialKey,
},"apps/web");
