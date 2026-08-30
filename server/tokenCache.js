import crypto from "node:crypto";
import { log } from "./logger.js";
const cache=new Map();const keyFor=(t,c,s)=>crypto.createHash("sha256").update(`${t}|${c}|${s}`).digest("hex");
export async function getAppOnlyToken({tenant,clientId,clientSecret,scope}){
  if(!tenant||!clientId||!clientSecret){const e=new Error("entra-app requires tenant, clientId and clientSecret.");e.status=400;throw e;}
  const useScope=scope||"https://ai.azure.com/.default";const k=keyFor(tenant,clientId,useScope);
  const hit=cache.get(k);
  if(hit&&hit.expiresAt>Date.now()+60000){ log.trace("auth", `app-only token cache HIT (tenant=${tenant})`); return hit.token; }
  log.trace("auth", `app-only token cache MISS → requesting from Entra (tenant=${tenant})`);
  const url=`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body=new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret,scope:useScope});
  const t0=Date.now();
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  log.trace("auth", `token endpoint ← ${res.status} in ${Date.now()-t0}ms`);
  if(!res.ok){let d="";try{d=await res.text();}catch{}log.warn("auth",`app-only token FAILED (${res.status}): ${d.slice(0,200)}`);const e=new Error(`Failed to obtain app token (${res.status}). ${d.slice(0,300)}`);e.status=401;throw e;}
  const json=await res.json();cache.set(k,{token:json.access_token,expiresAt:Date.now()+(json.expires_in??3600)*1000});return json.access_token;
}
