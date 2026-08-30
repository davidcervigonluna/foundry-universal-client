import { ensureAllowedEndpoint } from "./endpointGuard.js";
import { getAppOnlyToken } from "./tokenCache.js";
import { log, newReqId, redactHeaders, tokenInfo } from "./logger.js";

const KNOWN_LIFECYCLE = new Set([
  "response.created", "response.in_progress", "response.queued",
  "response.output_item.added", "response.output_item.done",
  "response.content_part.added", "response.content_part.done",
  "response.output_text.done", "response.output_text.annotation.added",
  "response.reasoning_summary_part.added", "response.reasoning_summary_part.done",
  "response.reasoning_summary_text.done", "response.reasoning_text.done",
  "response.mcp_call.in_progress",
]);

function isReasoningModel(model) {
  const m = (model || "").toLowerCase();
  if (/-chat/.test(m)) return false;
  if (/gpt-5|gpt5/.test(m)) return true;
  if (/\bo[134](-|$|\b)/.test(m)) return true;
  if (/thinking|deepseek-r|qwq|reason/.test(m)) return true;
  return false;
}

export function sse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  if (typeof res.flush === "function") res.flush();
}
// Emit a unified timeline "activity" step.
function activity(res, obj) { sse(res, "activity", obj); }

export function readConnection(req) {
  const endpoint = req.header("X-Foundry-Endpoint");
  const agentId = req.header("X-Foundry-Agent") || null;
  const apiVersion = req.header("X-Foundry-Api-Version") || null;
  const authMode = req.header("X-Foundry-Auth-Mode") || "none";
  const model = req.header("X-Foundry-Model") || null;
  const kind = req.header("X-Foundry-Kind") || null;
  const api = req.header("X-Foundry-Api") || null;
  if (!endpoint) { const e = new Error("Missing X-Foundry-Endpoint header."); e.status = 400; throw e; }
  ensureAllowedEndpoint(endpoint);
  return {
    endpoint: endpoint.replace(/\/+$/, ""), agentId, apiVersion, authMode, model, kind, api,
    apiKey: req.header("X-Foundry-Key") || null,
    bearer: req.header("X-Foundry-Bearer") || null,
    tenant: req.header("X-Foundry-Tenant") || null,
    clientId: req.header("X-Foundry-Client-Id") || null,
    clientSecret: req.header("X-Foundry-Client-Secret") || null,
    scope: req.header("X-Foundry-Scope") || "https://ai.azure.com/.default",
  };
}

export async function buildUpstreamHeaders(conn, rid) {
  const headers = { "Content-Type": "application/json" };
  switch (conn.authMode) {
    case "apikey": if (conn.apiKey) headers["api-key"] = conn.apiKey; log.trace("auth", `[${rid}] using api-key ${tokenInfo(conn.apiKey)}`); break;
    case "entra-user": if (conn.bearer) headers["Authorization"] = `Bearer ${conn.bearer}`; log.trace("auth", `[${rid}] using delegated user token ${tokenInfo(conn.bearer)}`); break;
    case "entra-app": { log.trace("auth", `[${rid}] acquiring app-only token tenant=${conn.tenant} client=${conn.clientId}`); const token = await getAppOnlyToken({ tenant: conn.tenant, clientId: conn.clientId, clientSecret: conn.clientSecret, scope: conn.scope }); headers["Authorization"] = `Bearer ${token}`; log.trace("auth", `[${rid}] app-only token acquired ${tokenInfo(token)}`); break; }
    case "none": default: log.trace("auth", `[${rid}] no auth`); break;
  }
  return headers;
}

export function isAgentScopedPath(endpoint) { try { return /\/agents\/[^/]+\/endpoint/i.test(new URL(endpoint).pathname); } catch { return false; } }
export function projectBase(endpoint) { const u = new URL(endpoint); const m = u.pathname.match(/^(.*\/api\/projects\/[^/]+)/i); if (m) { u.pathname = m[1]; u.search = ""; return u.toString(); } u.search = ""; return u.toString().replace(/\/+$/, ""); }
export function resourceRoot(endpoint) { const u = new URL(endpoint); u.pathname = ""; u.search = ""; return u.toString().replace(/\/+$/, ""); }

export function resolveResponsesUrl(endpoint, apiVersion, kind) {
  if (kind === "playground") { const base = projectBase(endpoint); return `${base.replace(/\/+$/, "")}/openai/v1/responses`; }
  const u = new URL(endpoint); let pathname = u.pathname.replace(/\/+$/, "");
  if (/\/responses$/i.test(pathname)) { }
  else if (/\/api\/projects\/[^/]+$/i.test(pathname)) { pathname = `${pathname}/openai/v1/responses`; }
  else pathname = `${pathname}/responses`;
  u.pathname = pathname;
  if (apiVersion && !/\/openai\/v1\//i.test(pathname)) u.searchParams.set("api-version", apiVersion);
  return u.toString();
}
function chatCompletionsUrl(endpoint) { return `${projectBase(endpoint).replace(/\/+$/, "")}/openai/v1/chat/completions`; }
function isMaiImageModel(model) { return /mai[-_]?image/i.test(model || ""); }
function imageUrls(endpoint, model) { const root = resourceRoot(endpoint); const openai = `${root}/openai/v1/images/generations`; const mai = `${root}/mai/v1/images/generations`; return isMaiImageModel(model) ? [mai, openai] : [openai, mai]; }

function mimeFromFormat(fmt) { const f = (fmt || "png").toLowerCase(); return f === "jpeg" || f === "jpg" ? "image/jpeg" : f === "webp" ? "image/webp" : "image/png"; }
function emitImage(res, state, b64, mime, alt) { if (!b64) return; state.imageEmitted = true; sse(res, "image", { mimeType: mime || "image/png", b64, alt: alt || "Generated image" }); }
function markGenerating(res, state) { if (!state.generatingStarted) { state.generatingStarted = true; if (state.thinkingStarted) activity(res, { id: "think", state: "done" }); activity(res, { id: "gen", kind: "generating", tool: "generating", label: "Generating response", state: "running" }); } }
function emitTextIfMissing(res, state, text) { if (text && !state.textStreamed) { state.textStreamed = true; markGenerating(res, state); sse(res, "token", { delta: text }); } }
function emitUsage(res, state, usage) { if (!usage || state.usageSent) return; state.usageSent = true; const u = { inputTokens: usage.input_tokens ?? usage.prompt_tokens ?? null, outputTokens: usage.output_tokens ?? usage.completion_tokens ?? null, totalTokens: usage.total_tokens ?? null, reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? null, cachedTokens: usage.input_tokens_details?.cached_tokens ?? null, exact: true }; log.info("upstream", `[${state.rid}] usage in=${u.inputTokens} out=${u.outputTokens} total=${u.totalTokens}${u.reasoningTokens ? ` reasoning=${u.reasoningTokens}` : ""}`); sse(res, "usage", u); }

function toResponsesInput(messages) {
  if (!Array.isArray(messages)) return messages;
  return messages.map((m) => { const isAssistant = m.role === "assistant"; const textType = isAssistant ? "output_text" : "input_text"; const parts = []; if (m.content) parts.push({ type: textType, text: m.content }); if (!isAssistant && Array.isArray(m.images)) for (const img of m.images) parts.push({ type: "input_image", image_url: img.dataUrl }); if (parts.length === 0) parts.push({ type: textType, text: "" }); return { role: m.role, content: parts }; });
}
function extractFromCompleted(response, res, state) {
  const out = response?.output; if (!Array.isArray(out)) return;
  for (const item of out) { if (!item || typeof item !== "object") continue; const it = item.type || "";
    if (it === "message" && Array.isArray(item.content)) { for (const part of item.content) { const pt = part?.type || ""; if ((pt === "output_text" || pt === "text") && part.text) emitTextIfMissing(res, state, part.text); else if (pt === "refusal" && part.refusal) emitTextIfMissing(res, state, part.refusal); else if ((pt === "output_image" || pt === "image") && !state.imageEmitted) emitImage(res, state, part.image_base64 || part.b64_json || part.result, part.mime_type, part.alt); } }
    else if (it === "image_generation_call" && !state.imageEmitted) emitImage(res, state, item.result || item.b64_json, mimeFromFormat(item.output_format), "Generated image");
    else if (it === "output_text" && item.text) emitTextIfMissing(res, state, item.text);
    else if (it === "reasoning" && Array.isArray(item.summary)) { const t = item.summary.map((s) => s.text || "").join(""); if (t) sse(res, "reasoning", { delta: t }); }
  }
}

const NATIVE_TOOL_LABEL = { web_search: "Searching the web", file_search: "Searching documents", code_interpreter: "Running code", computer: "Using computer" };

function parseResponsesEvent(evt, res, state) {
  if (!evt || typeof evt !== "object") return; const type = evt.type || "";
  log.trace("stream", `[${state.rid}] event ${type}`, evt);

  // ---- Text / reasoning ----
  if (type.endsWith("output_text.delta") && typeof evt.delta === "string") { state.textStreamed = true; markGenerating(res, state); sse(res, "token", { delta: evt.delta }); return; }
  if (type.endsWith("output_text.done") && typeof evt.text === "string") { emitTextIfMissing(res, state, evt.text); return; }
  if (type.includes("reasoning") && type.endsWith(".delta")) {
    if (!state.thinkingStarted) { state.thinkingStarted = true; activity(res, { id: "think", kind: "thinking", tool: "thinking", label: "Thinking", state: "running" }); }
    if (typeof evt.delta === "string") sse(res, "reasoning", { delta: evt.delta });
    return;
  }
  if (type.endsWith("annotation.added") && evt.annotation) { const a = evt.annotation; sse(res, "citation", { kind: a.type || "url_citation", title: a.title || a.filename || a.url || "Source", url: a.url || null, filename: a.filename || null }); return; }

  // ---- Native agent tools: web_search / file_search / code_interpreter / computer ----
  const tm = type.match(/(web_search|file_search|code_interpreter|computer)_call\.([a-z_.]+)/i);
  if (tm) {
    const tool = tm[1].toLowerCase(); const sub = tm[2].toLowerCase();
    const id = evt.item_id || evt.id || `${tool}`;
    const label = NATIVE_TOOL_LABEL[tool] || "Using tool";
    if (sub === "in_progress" || sub === "searching" || sub === "interpreting" || sub.startsWith("code")) { activity(res, { id, kind: "tool", tool, label, state: "running" }); }
    else if (sub === "completed" || sub === "done") { activity(res, { id, state: "done" }); }
    else if (sub === "failed") { activity(res, { id, state: "error" }); }
    return;
  }

  // ---- MCP ----
  if (type.includes("mcp_list_tools")) {
    if (type.endsWith("in_progress")) { activity(res, { id: "mcp-list", kind: "tool", tool: "mcp", label: "Discovering MCP tools", state: "running" }); return; }
    if (type.endsWith("completed") || type.endsWith("done")) { const item = evt.item || {}; const tools = Array.isArray(item.tools) ? item.tools.map((t) => t?.name || t) : (Array.isArray(evt.tools) ? evt.tools.map((t) => t?.name || t) : null); const server = item.server_label || item.server || evt.server_label || null; log.info("stream", `[${state.rid}] mcp tools discovered: ${tools ? tools.join(", ") : "?"} (server=${server || "?"})`); sse(res, "mcp", { phase: "list", id: evt.item_id || item.id || null, server, tools }); activity(res, { id: "mcp-list", kind: "tool", tool: "mcp", label: `Discovered ${tools ? tools.length : 0} MCP tool(s)`, detail: tools ? tools.join(", ") : undefined, state: "done" }); return; }
    if (type.endsWith("failed")) { sse(res, "mcp", { phase: "list-error", id: evt.item_id || null }); activity(res, { id: "mcp-list", state: "error" }); return; }
  }
  if (type.endsWith("mcp_call_arguments.delta")) { if (typeof evt.delta === "string") sse(res, "mcp", { phase: "args-delta", id: evt.item_id || evt.id || null, delta: evt.delta }); return; }
  if (type.endsWith("mcp_call_arguments.done")) { const args = typeof evt.arguments === "string" ? evt.arguments : (evt.arguments ? JSON.stringify(evt.arguments) : null); log.info("stream", `[${state.rid}] mcp args done: ${args}`); sse(res, "mcp", { phase: "args-done", id: evt.item_id || evt.id || null, arguments: args }); activity(res, { id: `mcp:${evt.item_id || evt.id}`, detail: args }); return; }
  if (type.includes("mcp_call")) {
    if (type.endsWith("in_progress")) { const id = evt.item_id || evt.id || null; log.info("stream", `[${state.rid}] mcp call start id=${id || "?"}`); sse(res, "mcp", { phase: "start", id }); activity(res, { id: `mcp:${id}`, kind: "tool", tool: "mcp", label: "Calling MCP tool", state: "running" }); return; }
    if (type.endsWith("completed") || type.endsWith("done")) { const id = evt.item_id || evt.id || null; sse(res, "mcp", { phase: "end", id }); activity(res, { id: `mcp:${id}`, state: "done" }); return; }
    if (type.endsWith("failed")) { const id = evt.item_id || evt.id || null; sse(res, "mcp", { phase: "error", id }); activity(res, { id: `mcp:${id}`, state: "error" }); return; }
  }

  // ---- Images ----
  if (type.endsWith("image_generation.completed") || type === "image_generation.completed") { emitImage(res, state, evt.b64_json || evt.result, mimeFromFormat(evt.output_format), "Generated image"); if (evt.usage) emitUsage(res, state, evt.usage); return; }
  if (type.endsWith("image_generation.partial_image") || type === "image_generation.partial_image") { emitImage(res, state, evt.b64_json, mimeFromFormat(evt.output_format), "Image (progressive)"); return; }

  // ---- Output items ----
  if (type.endsWith("output_item.added") || type.endsWith("output_item.done")) { const item = evt.item || {}; const itype = item.type || "";
    if (itype === "mcp_call") { const id = item.id || null; sse(res, "mcp", { phase: type.endsWith("done") ? "detail-end" : "detail-start", id, server: item.server_label || item.server || "MCP", name: item.name || item.tool_name || "tool", arguments: item.arguments ?? null, output: item.output ?? null }); activity(res, { id: `mcp:${id}`, kind: "tool", tool: "mcp", label: item.name ? `Calling MCP: ${item.name}` : "Calling MCP tool", server: item.server_label || item.server || undefined, name: item.name || undefined, detail: item.arguments ?? undefined, state: type.endsWith("done") ? "done" : "running" }); return; }
    if (itype === "reasoning" && Array.isArray(item.summary)) { const t = item.summary.map((s) => s.text || "").join(""); if (t) sse(res, "reasoning", { delta: t }); return; }
    if (itype === "image_generation_call" && (item.result || item.b64_json)) { emitImage(res, state, item.result || item.b64_json, mimeFromFormat(item.output_format), "Generated image"); return; }
    // Native tool items: capture query/results if present
    if (/(web_search|file_search|code_interpreter|computer)_call/.test(itype)) { const tool = itype.replace(/_call$/, ""); const label = NATIVE_TOOL_LABEL[tool] || "Using tool"; const q = item.query || item.action?.query || (Array.isArray(item.queries) ? item.queries.join(", ") : undefined); const nres = Array.isArray(item.results) ? item.results.length : undefined; const detail = [q ? `query: ${q}` : null, nres != null ? `${nres} result(s)` : null].filter(Boolean).join(" · ") || undefined; activity(res, { id: item.id || tool, kind: "tool", tool, label, detail, state: type.endsWith("done") ? "done" : "running" }); return; }
    if (itype === "message" && Array.isArray(item.content) && type.endsWith(".done")) { for (const part of item.content) { const pt = part?.type || ""; if ((pt === "output_text" || pt === "text") && part.text) emitTextIfMissing(res, state, part.text); else if (pt === "output_image" || pt === "image") emitImage(res, state, part.image_base64 || part.b64_json || part.result, part.mime_type, part.alt); } return; }
    return;
  }
  if (type.endsWith("content_part.added") || type.endsWith("content_part.done")) { const part = evt.part || {}; const pt = part.type || ""; if ((pt === "output_text" || pt === "text") && part.text) emitTextIfMissing(res, state, part.text); else if (pt === "output_image" || pt === "image") emitImage(res, state, part.image_base64 || part.b64_json || part.result, part.mime_type, part.alt); return; }

  // ---- End ----
  if (type.endsWith("response.completed") || type.endsWith("response.incomplete") || type === "done") { const response = evt.response || {}; extractFromCompleted(response, res, state); emitUsage(res, state, response.usage || evt.usage); if (state.generatingStarted) activity(res, { id: "gen", state: "done" }); sse(res, "done", { finishReason: response.incomplete_details?.reason || "stop" }); return; }
  if (type.endsWith("response.failed") || type === "error") { const msg = evt.response?.error?.message || evt.message || "The response failed."; log.warn("stream", `[${state.rid}] upstream failure event: ${msg}`); sse(res, "error", { message: msg }); return; }

  if (KNOWN_LIFECYCLE.has(type)) { /* benign */ }
  else { log.warn("stream", `[${state.rid}] UNHANDLED unknown event type=${type}`, evt); }
}

function toChatMessages(messages, systemPrompt) { const out = []; if (systemPrompt) out.push({ role: "system", content: systemPrompt }); for (const m of messages || []) { if (Array.isArray(m.images) && m.images.length && m.role === "user") { const parts = []; if (m.content) parts.push({ type: "text", text: m.content }); for (const img of m.images) parts.push({ type: "image_url", image_url: { url: img.dataUrl } }); out.push({ role: m.role, content: parts }); } else { out.push({ role: m.role, content: m.content ?? "" }); } } return out; }
function parseChatEvent(evt, res, state) { if (!evt || typeof evt !== "object") return; log.trace("stream", `[${state.rid}] chat event`, evt); if (evt.usage) emitUsage(res, state, evt.usage); const choice = evt.choices?.[0]; if (!choice) return; const delta = choice.delta || {}; const rc = delta.reasoning_content ?? delta.reasoning; if (typeof rc === "string" && rc) { if (!state.thinkingStarted) { state.thinkingStarted = true; activity(res, { id: "think", kind: "thinking", tool: "thinking", label: "Thinking", state: "running" }); } sse(res, "reasoning", { delta: rc }); } if (typeof delta.content === "string" && delta.content) { state.textStreamed = true; markGenerating(res, state); sse(res, "token", { delta: delta.content }); } }

async function handleImage(conn, res, userBody, rid) {
  const prompt = (userBody.messages || []).filter((m) => m.role === "user").map((m) => m.content).filter(Boolean).slice(-1)[0] || "";
  log.trace("upstream", `[${rid}] image prompt: ${prompt}`);
  const body = { model: conn.model, prompt, n: 1, size: userBody.size || "1024x1024" };
  const headers = await buildUpstreamHeaders(conn, rid); const urls = imageUrls(conn.endpoint, conn.model); let lastErr = "";
  for (const url of urls) {
    log.info("upstream", `[${rid}] → POST ${url} model=${conn.model} (image)`);
    let up; const t0 = Date.now();
    try { up = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); } catch (err) { lastErr = err.message; log.warn("upstream", `[${rid}] image fetch error: ${err.message}`); continue; }
    log.info("upstream", `[${rid}] ← ${up.status} in ${Date.now() - t0}ms`);
    if (up.status === 404) { lastErr = `404 at ${new URL(url).pathname}`; log.warn("upstream", `[${rid}] 404 → trying next image route`); continue; }
    if (!up.ok) { let d = ""; try { d = await up.text(); } catch {} sse(res, "error", { message: `Foundry returned ${up.status} (image). ${d.slice(0, 300)}` }); return; }
    let json; try { json = await up.json(); } catch { sse(res, "error", { message: "Invalid image response." }); return; }
    const item = json.data?.[0] || {}; const b64 = item.b64_json || item.image_base64 || null;
    if (b64) sse(res, "image", { mimeType: "image/png", b64, alt: "Generated image" }); else { sse(res, "error", { message: "The image model did not return b64_json." }); return; }
    if (json.usage) emitUsage(res, { usageSent: false, rid }, json.usage); sse(res, "done", { finishReason: "stop" }); return;
  }
  sse(res, "error", { message: `Image endpoint not found (tried /openai/v1 and /mai/v1). ${lastErr}` });
}
async function relayStream(upstream, res, kindOfParser, rid) {
  const reader = upstream.body.getReader(); const decoder = new TextDecoder(); const state = { usageSent: false, textStreamed: false, imageEmitted: false, doneSent: false, thinkingStarted: false, generatingStarted: false, rid }; let buffer = "";
  while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let sep; while ((sep = buffer.indexOf("\n\n")) !== -1) { const block = buffer.slice(0, sep); buffer = buffer.slice(sep + 2); for (const line of block.split("\n")) { const t = line.trim(); if (!t.startsWith("data:")) continue; const payload = t.slice(5).trim(); if (payload === "[DONE]") { if (!state.doneSent) { state.doneSent = true; if (state.generatingStarted) activity(res, { id: "gen", state: "done" }); sse(res, "done", { finishReason: "stop" }); } continue; } try { const evt = JSON.parse(payload); if (kindOfParser === "chat") parseChatEvent(evt, res, state); else parseResponsesEvent(evt, res, state); } catch (err) { log.trace("stream", `[${rid}] non-JSON chunk skipped`); } } } }
  if (!state.doneSent) { if (state.generatingStarted) activity(res, { id: "gen", state: "done" }); sse(res, "done", { finishReason: "stop" }); }
  if (!state.textStreamed && !state.imageEmitted) { log.warn("stream", `[${rid}] stream ended with no recognizable content`); sse(res, "error", { message: "The model returned no recognizable content. Try switching the API (Responses/Chat/Image), or set LOG_LEVEL=trace." }); }
}

export async function proxyChat(req, res, userBody) {
  const rid = newReqId();
  const conn = readConnection(req);
  res.status(200); res.setHeader("Content-Type", "text/event-stream"); res.setHeader("Cache-Control", "no-cache"); res.setHeader("Connection", "keep-alive"); res.setHeader("X-Accel-Buffering", "no");
  const kind = conn.kind || (isAgentScopedPath(conn.endpoint) ? "agent" : (conn.model ? "playground" : "agent"));
  const api = (kind === "playground") ? (conn.api || "responses") : "responses";
  log.info("route", `[${rid}] chat request kind=${kind} api=${api} model=${conn.model || "-"} authMode=${conn.authMode} endpoint=${conn.endpoint}`);
  if (log.enabled("trace")) { const last = (userBody.messages || []).slice(-1)[0]; log.trace("route", `[${rid}] last user message: ${last?.content ?? ""}`); }

  if (api === "image") { try { await handleImage(conn, res, userBody, rid); } catch (err) { log.warn("upstream", `[${rid}] image error: ${err.message}`); sse(res, "error", { message: err.message }); } finally { res.end(); } return; }

  if (api === "chat") {
    const url = chatCompletionsUrl(conn.endpoint);
    const body = { model: conn.model, messages: toChatMessages(userBody.messages, userBody.systemPrompt), stream: true, stream_options: { include_usage: true } };
    const headers = await buildUpstreamHeaders(conn, rid);
    log.info("upstream", `[${rid}] → POST ${url} model=${conn.model} (chat)`);
    log.trace("upstream", `[${rid}] request headers`, redactHeaders(headers));
    log.trace("upstream", `[${rid}] request body`, body);
    let up; const t0 = Date.now();
    try { up = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); } catch (err) { log.warn("upstream", `[${rid}] chat fetch error: ${err.message}`); sse(res, "error", { message: `Could not reach Foundry (chat): ${err.message}` }); return res.end(); }
    log.info("upstream", `[${rid}] ← ${up.status} in ${Date.now() - t0}ms`);
    if (!up.ok || !up.body) { let d = ""; try { d = await up.text(); } catch {} log.warn("upstream", `[${rid}] chat error body: ${d.slice(0, 300)}`); sse(res, "error", { message: `Foundry returned ${up.status} (chat). ${d.slice(0, 300)}` }); return res.end(); }
    try { await relayStream(up, res, "chat", rid); } catch (err) { log.warn("stream", `[${rid}] streaming error: ${err.message}`); sse(res, "error", { message: `Streaming error: ${err.message}` }); } finally { res.end(); }
    return;
  }

  const url = resolveResponsesUrl(conn.endpoint, conn.apiVersion, kind);
  const targetIsAgent = kind === "agent" || isAgentScopedPath(url);
  log.info("route", `[${rid}] responses URL resolved: ${url} (targetIsAgent=${targetIsAgent})`);
  const input = toResponsesInput(userBody.messages) ?? userBody.input;

  function buildBody(withReasoning) { const b = { input, stream: true }; if (userBody.systemPrompt) b.instructions = userBody.systemPrompt; if (!targetIsAgent) { if (conn.model) b.model = conn.model; else if (userBody.model) b.model = userBody.model; } if (withReasoning && !targetIsAgent && isReasoningModel(conn.model)) b.reasoning = { summary: "auto" }; return b; }
  const wantReasoning = !targetIsAgent && isReasoningModel(conn.model);
  if (wantReasoning) log.info("route", `[${rid}] model is reasoning-capable → requesting reasoning.summary`);
  const headers = await buildUpstreamHeaders(conn, rid);
  async function attempt(withReasoning) { const body = buildBody(withReasoning); log.info("upstream", `[${rid}] → POST ${url}${withReasoning ? " (+reasoning)" : ""}`); log.trace("upstream", `[${rid}] request headers`, redactHeaders(headers)); log.trace("upstream", `[${rid}] request body`, body); const t0 = Date.now(); const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) }); log.info("upstream", `[${rid}] ← ${r.status} in ${Date.now() - t0}ms`); return r; }

  let upstream;
  try { upstream = await attempt(wantReasoning); }
  catch (err) { log.warn("upstream", `[${rid}] fetch error: ${err.message}`); sse(res, "error", { message: `Could not reach Foundry: ${err.message}` }); return res.end(); }

  if (wantReasoning && upstream.status === 400) {
    let d = ""; try { d = await upstream.text(); } catch {}
    if (/reasoning/i.test(d) || /unsupported/i.test(d)) { log.warn("route", `[${rid}] 400 with reasoning; retrying WITHOUT reasoning. detail: ${d.slice(0, 200)}`); try { upstream = await attempt(false); } catch (err) { sse(res, "error", { message: `Could not reach Foundry: ${err.message}` }); return res.end(); } }
    else { log.warn("upstream", `[${rid}] 400 error body: ${d.slice(0, 300)}`); sse(res, "error", { message: `Foundry returned 400. ${d.slice(0, 300)}` }); return res.end(); }
  }

  if (!upstream.ok || !upstream.body) { let d = ""; try { d = await upstream.text(); } catch {} log.warn("upstream", `[${rid}] error body: ${d.slice(0, 300)}`); sse(res, "error", { message: `Foundry returned ${upstream.status}. ${d.slice(0, 300)}` }); return res.end(); }
  try { await relayStream(upstream, res, "responses", rid); } catch (err) { log.warn("stream", `[${rid}] streaming error: ${err.message}`); sse(res, "error", { message: `Streaming error: ${err.message}` }); } finally { res.end(); }
}
