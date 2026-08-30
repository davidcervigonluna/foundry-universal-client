import { useState, useEffect, useCallback } from "react";
import { type ConnectionProfile, type ProjectDest, type ApiSurface, saveActive, suggestApiForModel } from "../lib/connectionProfile";
import { fetchDeployments, fetchAgents, type Deployment, type AgentInfo } from "../lib/streamClient";

interface Props { connection: ConnectionProfile; onChanged: () => void; }
const API_LABEL: Record<ApiSurface, string> = { responses: "Responses", chat: "Chat", image: "Image" };

// Build the agent responses endpoint from the project endpoint when discovery
// does not return one (the /agents list often omits it).
function buildAgentEndpoint(projectEndpoint: string, agentName: string): string {
  const base = (projectEndpoint || "").replace(/\/+$/, "");
  return `${base}/agents/${encodeURIComponent(agentName)}/endpoint/protocols/openai/responses`;
}

export function DestinationBar({ connection, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [manual, setManual] = useState("");

  const dest: ProjectDest = connection.dest ?? "playground";
  const api: ApiSurface = connection.api ?? "responses";
  // Show a neutral prompt when nothing is selected (no stale last choice).
  const currentLabel = dest === "playground"
    ? (connection.model ? `${connection.model} · ${API_LABEL[api]}` : "Select model")
    : (connection.agentEndpoint ? (connection.agentId || "Agent") : "Select agent");

  const setApi = (a: ApiSurface) => { saveActive({ ...connection, api: a }); onChanged(); };

  const discover = useCallback(async () => {
    if (!connection.endpoint) return;
    setLoading(true); setMsg("Discovering…");
    if (dest === "playground") {
      const r = await fetchDeployments(connection);
      if (r.ok && r.deployments) { setDeployments(r.deployments); setMsg(`${r.deployments.length} models`); }
      else setMsg(`❌ ${r.error}`);
    } else {
      const r = await fetchAgents(connection);
      if (r.ok && r.agents) { setAgents(r.agents); setMsg(`${r.agents.length} agents`); }
      else setMsg(`❌ ${r.error}`);
    }
    setLoading(false);
  }, [connection, dest]);

  // Discover when the popover opens or when the destination changes.
  useEffect(() => {
    if (!open) return;
    if (dest === "playground" && deployments.length === 0) discover();
    if (dest === "agent" && agents.length === 0) discover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dest]);

  const pickModel = (name: string) => { saveActive({ ...connection, dest: "playground", model: name, api: suggestApiForModel(name) }); onChanged(); setOpen(false); };

  const pickAgent = (a: AgentInfo) => {
    const endpoint = a.endpoint || buildAgentEndpoint(connection.endpoint, a.name || a.id);
    saveActive({ ...connection, dest: "agent", agentEndpoint: endpoint, agentId: a.id });
    onChanged(); setOpen(false);
  };

  const applyManual = () => {
    if (!manual.trim()) return;
    if (dest === "playground") saveActive({ ...connection, dest: "playground", model: manual.trim(), api: suggestApiForModel(manual.trim()) });
    else saveActive({ ...connection, dest: "agent", agentEndpoint: manual.trim(), agentId: undefined });
    setManual(""); onChanged(); setOpen(false);
  };

  return (
    <div className="dest-bar">
      <button className="dest-current" onClick={() => setOpen((o) => !o)} title="Choose destination">
        {dest === "playground" ? "🎛" : "🤖"} <b>{currentLabel}</b> ▾
      </button>
      {open && (
        <div className="dest-popover" onMouseLeave={() => setOpen(false)}>
          {dest === "playground" && (
            <>
              <div className="dest-head"><span>Model API</span></div>
              <div className="dest-tabs">{(["responses", "chat", "image"] as ApiSurface[]).map((a) => (
                <button key={a} className={api === a ? "active" : ""} onClick={() => setApi(a)}
                  title={a === "responses" ? "gpt-5.x" : a === "chat" ? "MAI-Thinking, chat" : "gpt-image / MAI-Image"}>{API_LABEL[a]}</button>
              ))}</div>
            </>
          )}
          <div className="dest-head">
            <span>{dest === "playground" ? "Model (deployment)" : "Project agent"}</span>
            <button className="btn-secondary btn-xs" onClick={discover} disabled={loading} title="Refresh list">{loading ? "…" : "↻ Refresh"}</button>
          </div>
          {msg && <p className="dest-msg">{msg}</p>}
          <div className="dest-list">
            {dest === "playground" && deployments.map((d) => (
              <button key={d.name} className={`dest-item ${connection.model === d.name ? "active" : ""}`} onClick={() => pickModel(d.name)}>{d.name}{d.model ? ` · ${d.model}` : ""}</button>
            ))}
            {dest === "agent" && agents.map((a) => (
              <button key={a.id} className={`dest-item ${connection.agentId === a.id ? "active" : ""}`} onClick={() => pickAgent(a)}>{a.name}{a.state ? ` (${a.state})` : ""}</button>
            ))}
            {loading && ((dest === "playground" && deployments.length === 0) || (dest === "agent" && agents.length === 0)) && (
              <p className="history-empty">Loading…</p>
            )}
            {!loading && ((dest === "playground" && deployments.length === 0) || (dest === "agent" && agents.length === 0)) && (
              <p className="history-empty">Nothing discovered. Enter {dest === "playground" ? "the model name" : "the agent URL"} below.</p>
            )}
          </div>
          <div className="dest-manual">
            <input placeholder={dest === "playground" ? "model name…" : "agent endpoint URL…"} value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn-secondary btn-xs" onClick={applyManual}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}
