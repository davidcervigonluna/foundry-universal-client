import { readConnection, buildUpstreamHeaders, projectBase } from "./foundryProxy.js";
import { log, newReqId } from "./logger.js";
async function authedGet(conn, path, rid) {
  const base = projectBase(conn.endpoint);
  const u = new URL(base + path);
  if (conn.apiVersion) u.searchParams.set("api-version", conn.apiVersion);
  const headers = await buildUpstreamHeaders(conn, rid); headers["Accept"] = "application/json";
  log.info("discovery", `[${rid}] → GET ${u.toString()}`);
  const t0 = Date.now();
  const res = await fetch(u.toString(), { headers });
  log.info("discovery", `[${rid}] ← ${res.status} in ${Date.now() - t0}ms`);
  if (!res.ok) { let d = ""; try { d = await res.text(); } catch {} log.warn("discovery", `[${rid}] error body: ${d.slice(0, 300)}`); const e = new Error(`${res.status} ${d.slice(0, 300)}`); e.status = res.status; throw e; }
  return res.json();
}
export async function listDeployments(req) {
  const rid = newReqId(); const conn = readConnection(req);
  const json = await authedGet(conn, "/deployments", rid);
  const items = json.value || json.data || [];
  log.info("discovery", `[${rid}] deployments found: ${items.length}`);
  return items.map(d => ({ name: d.name || d.deploymentName || d.id, model: d.model?.name || d.modelName || d.model || null, publisher: d.model?.publisher || d.modelPublisher || null, type: d.type || d.deploymentType || null }));
}
export async function listAgents(req) {
  const rid = newReqId(); const conn = readConnection(req);
  const json = await authedGet(conn, "/agents", rid);
  const items = json.data || json.value || [];
  log.info("discovery", `[${rid}] agents found: ${items.length}`);
  return items.map(a => ({ id: a.id || a.name, name: a.name || a.id, state: a.state || null, endpoint: a.agent_endpoint?.url || a.agent_endpoint || null }));
}
