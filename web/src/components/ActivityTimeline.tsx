import { useState } from "react";
import type { ActivityItem } from "../lib/types";
import "./activity.css";

const ICON: Record<string, string> = { thinking:"🧠", generating:"✍️", web_search:"🔎", file_search:"📄", code_interpreter:"💻", computer:"🖥️", mcp:"🔌" };
function iconFor(a: ActivityItem): string { return ICON[a.tool ?? a.kind] ?? "🔧"; }

// Live status line under a streaming message: shows the current running step.
export function LiveStatus({ activity }: { activity?: ActivityItem[] }) {
  const running = (activity ?? []).filter((a) => a.state === "running");
  const cur = running.length ? running[running.length - 1] : null;
  const label = cur ? cur.label : "Working";
  const icon = cur ? iconFor(cur) : "⏳";
  return (<div className="live-status"><span className="live-dot"><i /><i /><i /></span> <span className="live-ico">{icon}</span> {label}…</div>);
}

// Chronological timeline of steps (thinking, tools, generating).
export function ActivityTimeline({ activity }: { activity: ActivityItem[] }) {
  const [open, setOpen] = useState(false);
  if (!activity.length) return null;
  const tools = activity.filter((a) => a.kind === "tool").length;
  const label = tools > 0 ? `🧭 Activity · ${tools} tool step${tools > 1 ? "s" : ""}` : "🧭 Activity";
  return (
    <div className="trace activity-panel">
      <button className="trace-head" onClick={() => setOpen((o) => !o)}><span>{label}</span><span>{open ? "▲" : "▼"}</span></button>
      {open && (
        <div className="trace-body activity-body">
          {activity.map((a, i) => (
            <div key={a.id + i} className={`act-item ${a.state}`}>
              <span className="act-ico">{iconFor(a)}</span>
              <div className="act-main">
                <div className="act-label">{a.label}{a.server ? <span className="act-server"> · {a.server}</span> : null}<span className="act-state">{a.state === "running" ? "…" : a.state === "error" ? "✕" : "✓"}</span></div>
                {a.detail && <pre className="act-detail">{a.detail.length > 500 ? a.detail.slice(0, 500) + "…" : a.detail}</pre>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
