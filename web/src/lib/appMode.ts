export type AppMode = "login" | "anon" | "entra";
const KEY = "foundry.appmode";
export function getAppMode(): AppMode { const v = sessionStorage.getItem(KEY); return v === "anon" || v === "entra" ? v : "login"; }
export function setAppMode(m: AppMode) { sessionStorage.setItem(KEY, m); }
export function resetAppMode() { sessionStorage.removeItem(KEY); }
