import { useEffect, useState } from "react";
import { listPrompts, savePromptItem, deletePromptItem, type SavedPrompt } from "../lib/historyDb";
import { newId } from "../lib/types";
interface Props{open:boolean;value:string;onChange:(v:string)=>void;onClose:()=>void;}
export function SystemPromptPanel({open,value,onChange,onClose}:Props){
  const[prompts,setPrompts]=useState<SavedPrompt[]>([]);const[saveName,setSaveName]=useState("");const[msg,setMsg]=useState("");
  useEffect(()=>{if(open)refresh();},[open]);const refresh=()=>listPrompts().then(setPrompts);
  if(!open)return null;
  const saveCurrent=async()=>{const text=value.trim();if(!text){setMsg("The prompt is empty.");return;}const name=saveName.trim()||(text.length>32?text.slice(0,32)+"…":text);await savePromptItem({id:newId(),name,text,updatedAt:Date.now()});setSaveName("");setMsg(`✅ Saved: ${name}`);refresh();};
  const apply=(p:SavedPrompt)=>{onChange(p.text);setMsg(`Loaded: ${p.name}`);};const remove=async(id:string)=>{await deletePromptItem(id);refresh();};
  return(<aside className="sidepanel prompt-panel"><div className="history-head"><span>🎚 System prompt</span><button className="btn-link" onClick={onClose}>✕</button></div><div className="prompt-editor"><label>Current prompt (applies to the next message)</label><textarea rows={8} value={value} onChange={e=>onChange(e.target.value)} placeholder="System instructions. You can change it between messages in the same chat." /><div className="prompt-actions">{value&&<button className="btn-link" onClick={()=>onChange("")}>Clear</button>}</div><div className="prompt-save"><input placeholder="Name to save…" value={saveName} onChange={e=>setSaveName(e.target.value)} /><button className="btn-secondary" onClick={saveCurrent}>💾 Save</button></div>{msg&&<p className="test-msg">{msg}</p>}</div><div className="prompt-catalog"><div className="citations-head">📚 Catalog ({prompts.length})</div>{prompts.length===0&&<p className="history-empty">No saved prompts yet.</p>}{prompts.map(p=>(<div key={p.id} className="history-item"><button className="history-item-main" onClick={()=>apply(p)} title={p.text}><span className="history-title">{p.name}</span><span className="history-meta">{p.text.length} chars · {new Date(p.updatedAt).toLocaleDateString()}</span></button><button className="history-del" onClick={()=>remove(p.id)}>🗑</button></div>))}</div></aside>);
}
