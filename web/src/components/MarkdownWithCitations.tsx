import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "../lib/types";
import "./citations.css";

const CITE_ICON: Record<string, string> = { url_citation:"🔗", uri_citation:"🔗", file_citation:"📄", file_path:"📎", container_file_citation:"🗄️" };
function iconFor(c: Citation): string { return CITE_ICON[c.kind] ?? "🔗"; }
function anchorId(msgId: string, n: number): string { return `cite-${msgId}-${n}`; }

// Replace citation placeholders in the raw text with clickable [n] markers.
// We keep only citations that actually have a placeholder present in the text.
function inlineCitations(text: string, citations: Citation[], msgId: string): { text: string; used: Citation[] } {
  const used: Citation[] = [];
  let out = text;
  citations.forEach((c) => {
    if (!c.replace) return;
    if (!out.includes(c.replace)) return;
    used.push(c);
    const n = used.length;
    // Marker syntax our custom renderer will pick up: ⟦cite:n⟧
    out = out.split(c.replace).join(`⟦cite:${n}⟧`);
  });
  return { text: out, used };
}

// Renders text nodes, turning ⟦cite:n⟧ into a superscript link to the footnote.
function renderWithMarkers(children: any, msgId: string): any {
  if (typeof children === "string") {
    const parts = children.split(/(⟦cite:\d+⟧)/g);
    return parts.map((p, i) => {
      const m = p.match(/^⟦cite:(\d+)⟧$/);
      if (m) {
        const n = Number(m[1]);
        return (<a key={i} href={`#${anchorId(msgId, n)}`} className="cite-ref" title={`Source ${n}`}><sup>[{n}]</sup></a>);
      }
      return <Fragment key={i}>{p}</Fragment>;
    });
  }
  if (Array.isArray(children)) return children.map((c, i) => <Fragment key={i}>{renderWithMarkers(c, msgId)}</Fragment>);
  return children;
}

export function MarkdownWithCitations({ msgId, content, citations }: { msgId: string; content: string; citations?: Citation[] }) {
  const cites = citations ?? [];
  const { text, used } = cites.length ? inlineCitations(content, cites, msgId) : { text: content, used: [] as Citation[] };
  // Fallback: citations without placeholders still shown as a plain list.
  const orphans = cites.filter((c) => !used.includes(c));

  return (
    <>
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p>{renderWithMarkers(children, msgId)}</p>,
            li: ({ children }) => <li>{renderWithMarkers(children, msgId)}</li>,
            td: ({ children }) => <td>{renderWithMarkers(children, msgId)}</td>,
          }}
        >{text}</ReactMarkdown>
      </div>

      {(used.length > 0 || orphans.length > 0) && (
        <div className="citations">
          <div className="citations-head">📎 Sources ({used.length + orphans.length})</div>
          <ol className="cite-list">
            {used.map((c, i) => (
              <li key={`u${i}`} id={anchorId(msgId, i + 1)} className="cite-item">
                <span className="cite-ico">{iconFor(c)}</span>
                {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> : <span>{c.title}{c.filename ? ` (${c.filename})` : ""}</span>}
                {c.quote && <div className="cite-quote">“{c.quote.length > 200 ? c.quote.slice(0, 200) + "…" : c.quote}”</div>}
              </li>
            ))}
            {orphans.map((c, i) => (
              <li key={`o${i}`} className="cite-item">
                <span className="cite-ico">{iconFor(c)}</span>
                {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a> : <span>{c.title}{c.filename ? ` (${c.filename})` : ""}</span>}
                {c.quote && <div className="cite-quote">“{c.quote.length > 200 ? c.quote.slice(0, 200) + "…" : c.quote}”</div>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
