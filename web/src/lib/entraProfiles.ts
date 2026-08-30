// Entra IDENTITY profiles, configurable from the UI.
// clientId and tenantId are NOT secrets (they appear in every login URL/token),
// so they are stored in localStorage. The frontend stays 100% agnostic: nothing
// about identity lives in the build except an OPTIONAL fallback.
export interface EntraProfile { id:string; name:string; tenantId:string; clientId:string; scope:string; }
const LIST_KEY="foundry.entra.profiles"; const ACTIVE_KEY="foundry.entra.active";
export const ENV_DEFAULTS = { clientId: import.meta.env.VITE_ENTRA_CLIENT_ID ?? "", tenantId: import.meta.env.VITE_ENTRA_TENANT_ID ?? "organizations", scope: import.meta.env.VITE_FOUNDRY_SCOPE ?? "https://ai.azure.com/.default" };
export function newProfileId():string{return Math.random().toString(36).slice(2)+Date.now().toString(36);}
export function listEntraProfiles():EntraProfile[]{const raw=localStorage.getItem(LIST_KEY);return raw?JSON.parse(raw):[];}
export function saveEntraProfile(p:EntraProfile):void{const list=listEntraProfiles().filter(x=>x.id!==p.id);list.push(p);localStorage.setItem(LIST_KEY,JSON.stringify(list));}
export function deleteEntraProfile(id:string):void{localStorage.setItem(LIST_KEY,JSON.stringify(listEntraProfiles().filter(x=>x.id!==id)));if(getActiveEntraProfile()?.id===id)clearActiveEntraProfile();}
export function setActiveEntraProfile(p:EntraProfile):void{sessionStorage.setItem(ACTIVE_KEY,JSON.stringify(p));}
export function getActiveEntraProfile():EntraProfile|null{const raw=sessionStorage.getItem(ACTIVE_KEY);return raw?JSON.parse(raw):null;}
export function clearActiveEntraProfile():void{sessionStorage.removeItem(ACTIVE_KEY);}
export function blankEntraProfile():EntraProfile{return{id:newProfileId(),name:"",tenantId:ENV_DEFAULTS.tenantId,clientId:ENV_DEFAULTS.clientId,scope:ENV_DEFAULTS.scope};}
export function hasEnvDefault():boolean{return !!ENV_DEFAULTS.clientId;}
export function validateEntraProfile(p:Partial<EntraProfile>):string[]{const e:string[]=[];if(!p.tenantId?.trim())e.push("Tenant ID is required (a GUID, or 'organizations'/'common').");if(!p.clientId?.trim())e.push("Client ID is required (SPA app registration).");if(!p.scope?.trim())e.push("Foundry scope is required.");return e;}
