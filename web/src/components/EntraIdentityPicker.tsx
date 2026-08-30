import { useState } from "react";
import { type EntraProfile, listEntraProfiles, saveEntraProfile, deleteEntraProfile, blankEntraProfile, validateEntraProfile, hasEnvDefault } from "../lib/entraProfiles";
import { redirectUri } from "../lib/entraAuth";
interface Props { onLogin: (p: EntraProfile) => Promise<void>; onBack: () => void; }
export function EntraIdentityPicker({ onLogin, onBack }: Props) {
  const [profiles, setProfiles] = useState<EntraProfile[]>(listEntraProfiles());
  const [form, setForm] = useState<EntraProfile>(blankEntraProfile());
  const [editing, setEditing] = useState(profiles.length === 0);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const set = (k: keyof EntraProfile, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const refresh = () => setProfiles(listEntraProfiles());
  const saveAndLogin = async () => {
    const e = validateEntraProfile(form); setErrors(e); if (e.length) return;
    const p: EntraProfile = { ...form, name: form.name.trim() || `${form.tenantId.slice(0, 8)}…` };
    saveEntraProfile(p); refresh(); setBusy(true);
    try { await onLogin(p); } catch (err) { setErrors([`Sign-in failed: ${(err as Error).message}`]); } finally { setBusy(false); }
  };
  const quickLogin = async (p: EntraProfile) => { setBusy(true); try { await onLogin(p); } catch (err) { setErrors([`Sign-in failed: ${(err as Error).message}`]); } finally { setBusy(false); } };
  const remove = (id: string) => { deleteEntraProfile(id); refresh(); };
  const newBlank = () => { setForm(blankEntraProfile()); setEditing(true); setErrors([]); };
  const copyRedirect = async () => { try { await navigator.clipboard.writeText(redirectUri()); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  return (
    <div className="setup-screen"><div className="setup-card">
      <button className="btn-link setup-back" onClick={onBack}>← Back</button>
      <h2>🔐 Entra ID · Identity</h2>
      <p className="hint">Configure your identity (SPA app registration). The <b>Client ID</b>
        and <b>Tenant ID</b> are not secrets; they are stored in this browser for reuse.
        None of this is baked into the build.</p>
      {profiles.length > 0 && !editing && (
        <div className="identity-list">
          <label>Saved identities</label>
          {profiles.map((p) => (
            <div key={p.id} className="identity-item">
              <button className="identity-main" onClick={() => quickLogin(p)} disabled={busy}>
                <span className="identity-name">👤 {p.name}</span>
                <span className="identity-meta">tenant {p.tenantId.slice(0, 12)} · client {p.clientId.slice(0, 8)}…</span>
              </button>
              <button className="identity-edit" onClick={() => { setForm(p); setEditing(true); }}>✏️</button>
              <button className="history-del" onClick={() => remove(p.id)}>🗑</button>
            </div>
          ))}
          <button className="btn-secondary" style={{ marginTop: 10 }} onClick={newBlank}>➕ New identity</button>
        </div>
      )}
      {editing && (<>
        <label>Name (label)</label>
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="My corporate tenant" />
        <div className="row">
          <div><label>Tenant ID</label><input value={form.tenantId} onChange={(e) => set("tenantId", e.target.value)} placeholder="GUID or 'organizations'" /></div>
          <div><label>Client ID (SPA)</label><input value={form.clientId} onChange={(e) => set("clientId", e.target.value)} placeholder="App registration GUID" /></div>
        </div>
        <label>Foundry scope</label>
        <input value={form.scope} onChange={(e) => set("scope", e.target.value)} placeholder="https://ai.azure.com/.default" />
        <div className="redirect-box">
          <div className="redirect-label">ℹ️ Register this <b>Redirect URI (SPA)</b> in your Entra app registration:</div>
          <div className="redirect-row"><code>{redirectUri()}</code><button className="btn-secondary btn-xs" onClick={copyRedirect}>{copied ? "✓ copied" : "📋 copy"}</button></div>
        </div>
        {hasEnvDefault() && <p className="mode-note ok">ℹ️ A deployment default is pre-filled; you can edit it.</p>}
        {errors.length > 0 && <ul className="errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="modal-actions">
          {profiles.length > 0 && <button className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>}
          <div style={{ flex: 1 }} />
          <button className="btn-primary" onClick={saveAndLogin} disabled={busy}>{busy ? "Signing in…" : "Save & sign in"}</button>
        </div>
      </>)}
    </div></div>
  );
}
