import type { ChatMessage } from "./types";
export interface Conversation { id:string; title:string; createdAt:number; updatedAt:number; connectionLabel:string; connectionEndpoint:string; messages:ChatMessage[]; }
const DB_NAME="foundry-universal-client";const STORE="conversations";const VERSION=2;
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:"id"});s.createIndex("updatedAt","updatedAt");s.createIndex("connectionEndpoint","connectionEndpoint");}if(!db.objectStoreNames.contains("prompts")){const p=db.createObjectStore("prompts",{keyPath:"id"});p.createIndex("updatedAt","updatedAt");}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function tx<T>(store:string,mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest):Promise<T>{const db=await openDb();return new Promise<T>((resolve,reject)=>{const t=db.transaction(store,mode);const req=fn(t.objectStore(store));req.onsuccess=()=>resolve(req.result as T);req.onerror=()=>reject(req.error);t.oncomplete=()=>db.close();});}
export async function saveConversation(c:Conversation){await tx("conversations","readwrite",s=>s.put(c));}
export async function getConversation(id:string){return tx<Conversation|undefined>("conversations","readonly",s=>s.get(id));}
export async function deleteConversation(id:string){await tx("conversations","readwrite",s=>s.delete(id));}
export async function listConversations():Promise<Conversation[]>{const all=await tx<Conversation[]>("conversations","readonly",s=>s.getAll());return(all||[]).sort((a,b)=>b.updatedAt-a.updatedAt);}
export function makeTitle(messages:ChatMessage[]):string{const f=messages.find(m=>m.role==="user"&&m.content.trim());const base=f?.content.trim()||"New conversation";return base.length>48?base.slice(0,48)+"…":base;}
export interface SavedPrompt { id:string; name:string; text:string; updatedAt:number; }
export async function savePromptItem(p:SavedPrompt){await tx("prompts","readwrite",s=>s.put(p));}
export async function deletePromptItem(id:string){await tx("prompts","readwrite",s=>s.delete(id));}
export async function listPrompts():Promise<SavedPrompt[]>{const all=await tx<SavedPrompt[]>("prompts","readonly",s=>s.getAll());return(all||[]).sort((a,b)=>b.updatedAt-a.updatedAt);}
