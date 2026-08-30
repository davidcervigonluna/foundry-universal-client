// ============================================================================
//  logger.js — Server logging with three levels.
//
//  LOG_LEVEL:
//    info   -> only info messages
//    warn   -> info + warn + error   (recommended default)
//    trace  -> everything, including full event payloads and unhandled dumps
//
//  Domains (prefix): [core] [auth] [route] [upstream] [stream] [discovery]
//
//  Safety:
//   - Credentials (tokens / secrets / api-key) are NEVER printed; only their
//     presence/expiry. See redactHeaders().
//   - Prompts and responses ARE shown at trace level (this is for debugging /
//     testing, not production).
//
//  Back-compat: DEBUG_STREAM=true is treated as LOG_LEVEL=trace.
// ============================================================================

const LEVELS = { info: 0, warn: 1, trace: 2 };

function resolveLevel() {
  const raw = String(process.env.LOG_LEVEL || "").toLowerCase();
  if (raw in LEVELS) return raw;
  if (String(process.env.DEBUG_STREAM || "").toLowerCase() === "true") return "trace";
  return "warn";
}
export const LOG_LEVEL = resolveLevel();
const CUR = LEVELS[LOG_LEVEL];

const JSON_MODE = String(process.env.LOG_JSON || "").toLowerCase() === "true";
const ts = () => new Date().toISOString();

function emit(level, domain, msg, extra) {
  if (JSON_MODE) {
    const rec = { t: ts(), level, domain, msg, ...(extra && typeof extra === "object" ? { data: extra } : {}) };
    (level === "warn" ? console.warn : level === "error" ? console.error : console.log)(JSON.stringify(rec));
  } else {
    const line = `[${level}][${domain}] ${msg}`;
    const out = extra !== undefined ? [line, extra] : [line];
    (level === "warn" ? console.warn : level === "error" ? console.error : console.log)(...out);
  }
}

// error and warn are shown whenever level >= warn. info only via .info().
export const log = {
  level: LOG_LEVEL,
  enabled(l) { return LEVELS[l] <= CUR; },
  info(domain, msg, extra) { if (CUR >= LEVELS.info) emit("info", domain, msg, extra); },      // shown at all levels
  warn(domain, msg, extra) { if (CUR >= LEVELS.warn) emit("warn", domain, msg, extra); },
  error(domain, msg, extra) { if (CUR >= LEVELS.warn) emit("error", domain, msg, extra); },     // errors ride with warn tier
  trace(domain, msg, extra) { if (CUR >= LEVELS.trace) emit("trace", domain, msg, extra); },
};

// Short correlation id per request (front->BFF->upstream).
export function newReqId() {
  return Math.random().toString(36).slice(2, 8);
}

// Redact sensitive headers/values. Never expose token/secret material.
export function redactHeaders(headers) {
  const h = headers || {};
  const out = {};
  for (const [k, v] of Object.entries(h)) {
    const key = k.toLowerCase();
    if (key === "authorization") { out[k] = v ? `Bearer <present,len=${String(v).length}>` : "<none>"; }
    else if (key === "api-key" || key === "x-foundry-key") { out[k] = v ? `<present,len=${String(v).length}>` : "<none>"; }
    else if (key === "x-foundry-client-secret") { out[k] = "<redacted>"; }
    else if (key === "x-foundry-bearer") { out[k] = v ? `<present,len=${String(v).length}>` : "<none>"; }
    else out[k] = v;
  }
  return out;
}

// Describe a JWT's expiry without exposing it (best-effort, no verification).
export function tokenInfo(token) {
  if (!token) return "<none>";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const mins = exp ? Math.round((exp.getTime() - Date.now()) / 60000) : null;
    return `<present,len=${token.length}${mins != null ? `,exp_in=${mins}m` : ""}>`;
  } catch {
    return `<present,len=${token.length}>`;
  }
}
