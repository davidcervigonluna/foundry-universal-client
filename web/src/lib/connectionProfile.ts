export type AuthMode = "none" | "apikey" | "entra-app" | "entra-login";
export type ConnKind = "agent" | "project";
export type ProjectDest = "playground" | "agent";
export type ApiSurface = "responses" | "chat" | "image";
export interface ConnectionProfile { label:string; kind:ConnKind; endpoint:string; apiVersion?:string; authMode:AuthMode; dest?:ProjectDest; model?:string; api?:ApiSurface; agentEndpoint?:string; agentId?:string; systemPrompt?:string; apiKey?:string; tenantId?:string; clientId?:string; clientSecret?:string; scope?:string; }
export interface EffectiveTarget { kind:"agent"|"playground"; endpoint:string; model?:string; api?:ApiSurface; }
export function effectiveTarget(p:ConnectionProfile):EffectiveTarget{ if(p.kind==="agent")return{kind:"agent",endpoint:p.endpoint}; const dest=p.dest??"playground"; if(dest==="agent")return{kind:"agent",endpoint:p.agentEndpoint||p.endpoint}; return{kind:"playground",endpoint:p.endpoint,model:p.model,api:p.api??"responses"}; }
export function targetIsAgent(p:ConnectionProfile|null):boolean{ if(!p)return false; return effectiveTarget(p).kind==="agent"; }
export function promptApplies(p:ConnectionProfile|null):boolean{ if(!p)return false; if(targetIsAgent(p))return false; const t=effectiveTarget(p); return t.api!=="image"; }
export function suggestApiForModel(name:string):ApiSurface{ if(/image/i.test(name))return "image"; if(/thinking|mai-ds|deepseek-r|qwq|reason/i.test(name))return "chat"; return "responses"; }
const ACTIVE_KEY="foundry.connection.active";const LIST_KEY="foundry.connection.saved";
export function saveActive(p:ConnectionProfile){sessionStorage.setItem(ACTIVE_KEY,JSON.stringify(p));}
export function loadActive():ConnectionProfile|null{const raw=sessionStorage.getItem(ACTIVE_KEY);return raw?JSON.parse(raw):null;}
export function clearActive(){sessionStorage.removeItem(ACTIVE_KEY);}
export function listSaved():ConnectionProfile[]{const raw=localStorage.getItem(LIST_KEY);return raw?JSON.parse(raw):[];}
export function saveToList(p:ConnectionProfile){const s={...p,apiKey:undefined,clientSecret:undefined};const list=listSaved().filter(x=>x.label!==p.label);list.push(s);localStorage.setItem(LIST_KEY,JSON.stringify(list));}
export function removeFromList(label:string){localStorage.setItem(LIST_KEY,JSON.stringify(listSaved().filter(x=>x.label!==label)));}
export function validateAnon(p:Partial<ConnectionProfile>):string[]{const e:string[]=[];if(!p.endpoint?.startsWith("https://"))e.push("The Agent endpoint must be an HTTPS URL.");if(!p.apiVersion)e.push("api-version is required (e.g. v1).");if(!p.tenantId||!p.clientId||!p.clientSecret)e.push("Tenant ID, Client ID and Client secret are required (service principal).");return e;}
export function validateProject(p:Partial<ConnectionProfile>):string[]{const e:string[]=[];if(!p.endpoint?.startsWith("https://"))e.push("The project endpoint must be an HTTPS URL.");if(!p.apiVersion)e.push("api-version is required (e.g. v1).");return e;}
export function isChatReady(p:ConnectionProfile|null):boolean{if(!p)return false;if(p.kind==="agent")return !!p.endpoint;if(validateProject(p).length)return false;const dest=p.dest??"playground";if(dest==="playground")return !!p.model;return !!p.agentEndpoint;}
