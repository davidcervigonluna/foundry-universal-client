import "./mcpTrace.css";
import { useState } from "react";
import type { Citation, McpCall, McpTools, Usage } from "../lib/types";
export function ReasoningPanel({text}:{text:string}){const[o,s]=useState(false);if(!text)return null;return(<div className="trace reasoning-panel"><button className="trace-head" onClick={()=>s(!o)}><span>🧠 Reasoning</span><span>{o?"▲":"▼"}</span></button>{o&&<div className="trace-body reasoning-body">{text}</div>}</div>);}

// Discovered MCP tools (from mcp_list_tools). Shows what the agent can call.
export function McpToolsPanel({groups}:{groups:McpTools[]}){
  const[o,s]=useState(false);
  if(!groups.length)return null;
  const total=groups.reduce((n,g)=>n+g.tools.length,0);
  return(<div className="trace mcp-tools-panel"><button className="trace-head" onClick={()=>s(!o)}><span>🧰 Available MCP tools ({total})</span><span>{o?"▲":"▼"}</span></button>{o&&<div className="trace-body">{groups.map((g,i)=>(<div key={i} className="mcp-tools-group">{g.server&&<div className="mcp-tools-server">{g.server}</div>}<div className="mcp-tools-list">{g.tools.map((t,j)=>(<span key={j} className="mcp-tool-chip">{t}</span>))}</div></div>))}</div>}</div>);
}

// MCP calls: server · tool + arguments (streamed live) + output.
export function McpPanel({calls}:{calls:McpCall[]}){
  const[o,s]=useState(true);
  if(!calls.length)return null;
  return(<div className="trace mcp-panel"><button className="trace-head" onClick={()=>s(!o)}><span>🔌 MCP calls ({calls.length})</span><span>{o?"▲":"▼"}</span></button>{o&&<div className="trace-body">{calls.map((c,i)=>{
    const args = c.arguments ?? (c.argsStream || "");
    return(<div key={c.id||i} className={`mcp-call ${c.status}`}>
      <div className="mcp-title"><span className="mcp-dot" /> <b>{c.server}</b> · {c.name}<span className="mcp-status">{c.status==="running"?"running…":c.status==="error"?"error":"ok"}</span></div>
      {args&&<pre className="mcp-pre mcp-args">▸ args: {args.length>800?args.slice(0,800)+"…":args}{c.status==="running"&&!c.arguments?"▍":""}</pre>}
      {c.output&&<pre className="mcp-pre">◂ out: {c.output.length>600?c.output.slice(0,600)+"…":c.output}</pre>}
    </div>);
  })}</div>}</div>);
}
export function CitationsPanel({citations}:{citations:Citation[]}){if(!citations.length)return null;return(<div className="citations"><div className="citations-head">📎 Sources ({citations.length})</div><ol>{citations.map((c,i)=>(<li key={i}>{c.url?<a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a>:<span>{c.title}{c.filename?` (${c.filename})`:""}</span>}</li>))}</ol></div>);}
export function UsageBadge({usage}:{usage:Usage}){const p:string[]=[];if(usage.inputTokens!=null)p.push(`▲ ${usage.inputTokens} in`);if(usage.outputTokens!=null)p.push(`▼ ${usage.outputTokens} out`);if(usage.totalTokens!=null)p.push(`Σ ${usage.totalTokens}`);if(usage.reasoningTokens)p.push(`🧠 ${usage.reasoningTokens}`);return(<div className={`usage-badge ${usage.exact?"":"approx"}`} title={usage.exact?"Tokens reported by Foundry":"Approximate estimate"}>🎫 {p.join(" · ")||"no data"}{usage.exact?"":" (approx.)"}</div>);}
export function PromptUsed({text}:{text:string}){const[o,s]=useState(false);if(!text)return null;return(<div className="trace prompt-used"><button className="trace-head" onClick={()=>s(!o)}><span>🎚 System prompt used</span><span>{o?"▲":"▼"}</span></button>{o&&<div className="trace-body reasoning-body">{text}</div>}</div>);}
