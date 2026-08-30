import { loadActive, effectiveTarget, type ConnectionProfile } from "./connectionProfile";
import { getFoundryUserToken } from "./entraAuth";
import type { AttachedImage } from "./types";

export interface ChatImagePart { type: "image"; mimeType: string; b64: string; alt: string; }
export interface CitationEvent { kind: string; title: string; url?: string | null; filename?: string | null; }
export interface McpEvent { phase: string; id?: string | null; server?: string | null; name?: string; arguments?: string | null; output?: string | null; delta?: string; tools?: string[] | null; }
export interface ActivityEvent { id: string; kind?: "thinking" | "tool" | "generating"; tool?: string; label?: string; state?: "running" | "done" | "error"; detail?: string; server?: string; name?: string; }
export interface UsageEvent { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null; reasoningTokens?: number | null; cachedTokens?: number | null; exact: boolean; }
export interface OutMessage { role: string; content: string; images?: { dataUrl: string }[]; }
export interface StreamHandlers { onToken:(d:string)=>void; onImage:(i:ChatImagePart)=>void; onReasoning:(d:string)=>void; onCitation:(c:CitationEvent)=>void; onMcp:(m:McpEvent)=>void; onActivity:(a:ActivityEvent)=>void; onUsage:(u:UsageEvent)=>void; onDone:()=>void; onError:(m:string)=>void; }

async function authHeaders(p: ConnectionProfile): Promise<Record<string, string>> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiVersion) h["X-Foundry-Api-Version"] = p.apiVersion;
  if (p.authMode === "apikey" && p.apiKey) { h["X-Foundry-Auth-Mode"] = "apikey"; h["X-Foundry-Key"] = p.apiKey; }
  else if (p.authMode === "entra-app") { h["X-Foundry-Auth-Mode"] = "entra-app"; if (p.tenantId) h["X-Foundry-Tenant"] = p.tenantId; if (p.clientId) h["X-Foundry-Client-Id"] = p.clientId; if (p.clientSecret) h["X-Foundry-Client-Secret"] = p.clientSecret; if (p.scope) h["X-Foundry-Scope"] = p.scope; }
  else if (p.authMode === "entra-login") { const t = await getFoundryUserToken(); h["X-Foundry-Auth-Mode"] = "entra-user"; if (t) h["X-Foundry-Bearer"] = t; }
  else { h["X-Foundry-Auth-Mode"] = "none"; }
  return h;
}
async function chatHeaders(p: ConnectionProfile): Promise<Record<string, string>> {
  const t = effectiveTarget(p); const h = await authHeaders(p);
  h["Accept"] = "text/event-stream"; h["X-Foundry-Endpoint"] = t.endpoint; h["X-Foundry-Kind"] = t.kind;
  if (t.kind === "playground" && t.model) h["X-Foundry-Model"] = t.model;
  if (t.kind === "playground" && t.api) h["X-Foundry-Api"] = t.api;
  if (p.agentId) h["X-Foundry-Agent"] = p.agentId;
  return h;
}
async function discoveryHeaders(p: ConnectionProfile): Promise<Record<string, string>> { const h = await authHeaders(p); h["X-Foundry-Endpoint"] = p.endpoint; h["X-Foundry-Kind"] = "project"; return h; }
function estimateTokens(text: string): number { return Math.max(0, Math.round(text.length / 4)); }

export async function streamChat(messages: OutMessage[], systemPrompt: string | undefined, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const profile = loadActive();
  if (!profile) { handlers.onError("No connection configured in this session."); return; }
  if (profile.authMode === "entra-login") { const t = await getFoundryUserToken(); if (!t) { handlers.onError("Entra session expired. Please sign in again."); return; } }
  const body: any = { messages }; if (systemPrompt) body.systemPrompt = systemPrompt;
  let res: Response;
  try { res = await fetch("/api/chat/stream", { method: "POST", headers: await chatHeaders(profile), body: JSON.stringify(body), signal }); }
  catch (e) { handlers.onError((e as Error).message); return; }
  if (res.status === 401 || res.status === 403) { handlers.onError("Unauthorized. Please sign in again or check permissions."); return; }
  if (!res.ok || !res.body) { handlers.onError(`HTTP ${res.status}`); return; }
  const reader = res.body.getReader(); const decoder = new TextDecoder();
  let buffer = ""; let finished = false; let usageSeen = false; let outputChars = 0;
  const inputChars = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0) + (systemPrompt?.length ?? 0);
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, sep); buffer = buffer.slice(sep + 2);
        if (raw.startsWith(":")) continue;
        let event = "message", data = "";
        for (const line of raw.split("\n")) { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) data += line.slice(5).trim(); }
        if (!data) continue;
        try {
          const parsed = JSON.parse(data);
          if (event === "token") { outputChars += (parsed.delta ?? "").length; handlers.onToken(parsed.delta ?? ""); }
          else if (event === "image") handlers.onImage({ type: "image", mimeType: parsed.mimeType ?? "image/png", b64: parsed.b64, alt: parsed.alt ?? "Generated image" });
          else if (event === "reasoning") handlers.onReasoning(parsed.delta ?? "");
          else if (event === "citation") handlers.onCitation(parsed as CitationEvent);
          else if (event === "mcp") handlers.onMcp(parsed as McpEvent);
          else if (event === "activity") handlers.onActivity(parsed as ActivityEvent);
          else if (event === "usage") { usageSeen = true; handlers.onUsage(parsed as UsageEvent); }
          else if (event === "done") { if (!usageSeen) handlers.onUsage({ inputTokens: estimateTokens(String(inputChars)), outputTokens: estimateTokens(String(outputChars)), totalTokens: null, exact: false }); finished = true; handlers.onDone(); return; }
          else if (event === "error") { finished = true; handlers.onError(parsed.message ?? "Error"); return; }
        } catch { /* partial */ }
      }
    }
  } catch (e) { if ((e as Error).name !== "AbortError") { finished = true; handlers.onError((e as Error).message); } }
  finally { try { reader.releaseLock(); } catch { /* noop */ } }
  if (!finished) { if (!usageSeen) handlers.onUsage({ inputTokens: estimateTokens(String(inputChars)), outputTokens: estimateTokens(String(outputChars)), totalTokens: null, exact: false }); handlers.onDone(); }
}

export async function testConnection(p: ConnectionProfile) { try { const res = await fetch("/api/test", { method: "POST", headers: await discoveryHeaders(p) }); const json = await res.json(); return res.ok ? { ok: true } : { ok: false, error: json.error }; } catch (e) { return { ok: false, error: (e as Error).message }; } }
export interface Deployment { name: string; model: string | null; publisher: string | null; type: string | null; }
export interface AgentInfo { id: string; name: string; state: string | null; endpoint: string | null; }
export async function fetchDeployments(p: ConnectionProfile): Promise<{ ok: boolean; deployments?: Deployment[]; error?: string }> { try { const res = await fetch("/api/deployments", { method: "POST", headers: await discoveryHeaders(p) }); const json = await res.json(); return res.ok ? { ok: true, deployments: json.deployments } : { ok: false, error: json.error }; } catch (e) { return { ok: false, error: (e as Error).message }; } }
export async function fetchAgents(p: ConnectionProfile): Promise<{ ok: boolean; agents?: AgentInfo[]; error?: string }> { try { const res = await fetch("/api/agents", { method: "POST", headers: await discoveryHeaders(p) }); const json = await res.json(); return res.ok ? { ok: true, agents: json.agents } : { ok: false, error: json.error }; } catch (e) { return { ok: false, error: (e as Error).message }; } }
export function fileToAttached(file: File): Promise<AttachedImage> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) }); reader.onerror = reject; reader.readAsDataURL(file); }); }
