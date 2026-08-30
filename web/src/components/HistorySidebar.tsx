import { useEffect, useState } from "react";
import { listConversations, deleteConversation, type Conversation } from "../lib/historyDb";
interface Props{open:boolean;activeId:string|null;currentEndpoint?:string;onSelect:(c:Conversation)=>void;onClose:()=>void;refreshKey:number;}
export function HistorySidebar({open,activeId,currentEndpoint,onSelect,onClose,refreshKey}:Props){
  const[items,setItems]=useState<Conversation[]>([]);const[q,setQ]=useState("");const[onlyThis,setOnlyThis]=useState(false);
  useEffect(()=>{if(open)listConversations().then(setItems);},[open,refreshKey]);
  if(!open)return null;
  const filtered=items.filter(c=>{if(onlyThis&&currentEndpoint&&c.connectionEndpoint!==currentEndpoint)return false;if(q&&!c.title.toLowerCase().includes(q.toLowerCase()))return false;return true;});
  const remove=async(id:string)=>{await deleteConversation(id);setItems(await listConversations());};
  return(<aside className="sidepanel"><div className="history-head"><span>💬 History</span><button className="btn-link" onClick={onClose}>✕</button></div><input className="history-search" placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} /><label className="history-filter"><input type="checkbox" checked={onlyThis} onChange={e=>setOnlyThis(e.target.checked)} /> This connection only</label><div className="history-list">{filtered.length===0&&<p className="history-empty">No saved conversations.</p>}{filtered.map(c=>(<div key={c.id} className={`history-item ${c.id===activeId?"active":""}`}><button className="history-item-main" onClick={()=>onSelect(c)} title={c.title}><span className="history-title">{c.title}</span><span className="history-meta">{c.connectionLabel||c.connectionEndpoint} · {new Date(c.updatedAt).toLocaleString()}</span></button><button className="history-del" onClick={()=>remove(c.id)}>🗑</button></div>))}</div></aside>);
}
