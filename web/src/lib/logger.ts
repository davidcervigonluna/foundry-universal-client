// Frontend logger with three levels (auth-focused). Logs go to the browser console.
// VITE_LOG_LEVEL: info | warn | trace   (default warn)
// Credentials are NEVER printed; only presence/expiry.
type Level = "info" | "warn" | "trace";
const ORDER: Record<Level, number> = { info: 0, warn: 1, trace: 2 };
function resolve(): Level { const raw = String(import.meta.env.VITE_LOG_LEVEL ?? "").toLowerCase(); return (raw === "info" || raw === "warn" || raw === "trace") ? raw : "warn"; }
export const LOG_LEVEL = resolve();
const CUR = ORDER[LOG_LEVEL];
function line(l: Level, domain: string, msg: string, extra?: unknown) {
  const s = `[${l}][${domain}] ${msg}`;
  const fn = l === "warn" ? console.warn : console.log;
  if (extra !== undefined) fn(s, extra); else fn(s);
}
export const log = {
  level: LOG_LEVEL,
  info(d: string, m: string, e?: unknown) { if (CUR >= ORDER.info) line("info", d, m, e); },
  warn(d: string, m: string, e?: unknown) { if (CUR >= ORDER.warn) line("warn", d, m, e); },
  error(d: string, m: string, e?: unknown) { if (CUR >= ORDER.warn) line("warn", d, m, e); },
  trace(d: string, m: string, e?: unknown) { if (CUR >= ORDER.trace) line("trace", d, m, e); },
};
// Describe a token's presence/expiry without exposing it.
export function tokenInfo(token?: string): string {
  if (!token) return "<none>";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const mins = exp ? Math.round((exp.getTime() - Date.now()) / 60000) : null;
    return `<present,len=${token.length}${mins != null ? `,exp_in=${mins}m` : ""}>`;
  } catch { return `<present,len=${token.length}>`; }
}
