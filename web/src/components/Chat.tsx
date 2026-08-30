import { useState, useRef, useEffect, useCallback } from "react";
import { Message } from "./Message";
import { streamChat, fileToAttached, type ChatImagePart, type CitationEvent, type McpEvent, type UsageEvent } from "../lib/streamClient";
import { type ChatMessage, type AttachedImage, type McpCall, type McpTools, newId } from "../lib/types";
import { loadActive } from "../lib/connectionProfile";
import { saveConversation, makeTitle } from "../lib/historyDb";
import { recordCall } from "../lib/rateMeter";
const MAX_FILES = 5; const MAX_SIZE = 8 * 1024 * 1024; const ACCEPT = ["image/png", "image/jpeg", "image/gif", "image/webp"];

interface Props { ready: boolean; readyHint: string; conversationId: string; initialMessages?: ChatMessage[]; systemPrompt: string; promptActive: boolean; persist?: boolean; onPersisted?: () => void; }

export function Chat({ ready, readyHint, conversationId, initialMessages, systemPrompt, promptActive, persist = true, onPersisted }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? []);
  const [input, setInput] = useState(""); const [pending, setPending] = useState<AttachedImage[]>([]);
  const [streaming, setStreaming] = useState(false); const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null); const fileRef = useRef<HTMLInputElement>(null); const bottomRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef(systemPrompt); useEffect(() => { promptRef.current = systemPrompt; }, [systemPrompt]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { if (messages.length === 0 || !persist) return; const conn = loadActive(); saveConversation({ id: conversationId, title: makeTitle(messages), createdAt: Date.now(), updatedAt: Date.now(), connectionLabel: conn?.label || "", connectionEndpoint: conn?.endpoint || "", messages }).then(() => onPersisted?.()); }, [messages, conversationId, persist]);
  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m))), []);
  const addFiles = useCallback(async (files: FileList | File[]) => { const valid = Array.from(files).filter((f) => ACCEPT.includes(f.type) && f.size <= MAX_SIZE); const room = MAX_FILES - pending.length; const attached = await Promise.all(valid.slice(0, room).map(fileToAttached)); setPending((prev) => [...prev, ...attached]); }, [pending.length]);
  const onPaste = (e: React.ClipboardEvent) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); addFiles(imgs); } };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const send = async () => {
    const text = input.trim(); if ((!text && pending.length === 0) || streaming || !ready) return;
    const promptNow = promptActive ? promptRef.current : ""; const attachments = pending;
    const userMsg: ChatMessage = { id: newId(), role: "user", content: text, attachments, systemPromptUsed: promptNow || undefined };
    const assistantId = newId(); setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput(""); setPending([]); setStreaming(true); recordCall();
    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content, images: m.attachments?.map((a) => ({ dataUrl: a.dataUrl })) }));
    const ac = new AbortController(); abortRef.current = ac;
    try {
      await streamChat(history, promptNow || undefined, {
        onToken: (d) => patch(assistantId, (m) => ({ ...m, content: m.content + d })),
        onImage: (img: ChatImagePart) => patch(assistantId, (m) => ({ ...m, images: [...(m.images ?? []), img] })),
        onReasoning: (d) => patch(assistantId, (m) => ({ ...m, reasoning: (m.reasoning ?? "") + d })),
        onCitation: (c: CitationEvent) => patch(assistantId, (m) => ({ ...m, citations: [...(m.citations ?? []), { kind: c.kind, title: c.title, url: c.url, filename: c.filename }] })),
        onMcp: (e: McpEvent) => patch(assistantId, (m) => applyMcp(m, e)),
        onUsage: (u: UsageEvent) => patch(assistantId, (m) => ({ ...m, usage: { ...u } })),
        onDone: () => {}, onError: (msg) => patch(assistantId, (m) => ({ ...m, content: `⚠️ ${msg}`, error: true })),
      }, ac.signal);
    } catch (err) { patch(assistantId, (m) => ({ ...m, content: `⚠️ ${(err as Error).message}`, error: true })); }
    finally { setStreaming(false); abortRef.current = null; }
  };
  const cancel = () => { abortRef.current?.abort(); setStreaming(false); };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  return (
    <div className="chat">
      <div className="messages" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
        {dragOver && <div className="drop-overlay">Drop images here 📎</div>}
        {messages.length === 0 && (<div className="empty"><h3>👋 Start chatting</h3><p>You'll see 🧠 reasoning, 🧰 tools, 🔌 MCP calls (with args), 📎 sources and 🎫 tokens.</p></div>)}
        {messages.map((m, i) => (<Message key={m.id} message={m} isStreaming={streaming && i === messages.length - 1 && m.role === "assistant"} />))}
        <div ref={bottomRef} />
      </div>
      {pending.length > 0 && (<div className="pending-bar">{pending.map((a, i) => (<div className="pending-thumb" key={i}><img src={a.dataUrl} alt={a.name} /><button onClick={() => setPending((p) => p.filter((_, j) => j !== i))}>×</button></div>))}</div>)}
      <div className="composer">
        <input ref={fileRef} type="file" accept={ACCEPT.join(",")} multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <button className="btn-attach" title="Attach images" disabled={!ready || pending.length >= MAX_FILES} onClick={() => fileRef.current?.click()}>📎</button>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onPaste={onPaste} placeholder={ready ? "Type a message…" : readyHint} disabled={!ready} rows={1} />
        {streaming ? <button className="btn-cancel" onClick={cancel}>■ Stop</button> : <button className="btn-send" onClick={send} disabled={!ready || (!input.trim() && pending.length === 0)}>Send ➤</button>}
      </div>
    </div>
  );
}

function applyMcp(m: ChatMessage, e: McpEvent): ChatMessage {
  // Discovered tools list.
  if (e.phase === "list") {
    const groups: McpTools[] = [...(m.mcpTools ?? [])];
    groups.push({ server: e.server ?? null, tools: Array.isArray(e.tools) ? e.tools : [] });
    return { ...m, mcpTools: groups };
  }
  if (e.phase === "list-start" || e.phase === "list-error") return m;

  const calls = [...(m.mcpCalls ?? [])];
  const idx = () => (e.id ? calls.findIndex((c) => c.id === e.id) : -1);
  const ensure = (): number => {
    let i = idx();
    if (i < 0) { calls.push({ id: e.id ?? null, server: e.server ?? "MCP", name: e.name ?? "tool", arguments: null, argsStream: "", output: null, status: "running" }); i = calls.length - 1; }
    return i;
  };

  if (e.phase === "start" || e.phase === "detail-start") {
    const i = ensure();
    calls[i] = { ...calls[i], server: e.server ?? calls[i].server, name: e.name ?? calls[i].name, arguments: e.arguments ?? calls[i].arguments, status: "running" };
  } else if (e.phase === "args-delta") {
    const i = ensure();
    calls[i] = { ...calls[i], argsStream: (calls[i].argsStream ?? "") + (e.delta ?? ""), status: "running" };
  } else if (e.phase === "args-done") {
    const i = ensure();
    calls[i] = { ...calls[i], arguments: e.arguments ?? calls[i].argsStream ?? null };
  } else if (e.phase === "detail-end" || e.phase === "end") {
    const i = ensure();
    calls[i] = { ...calls[i], server: e.server ?? calls[i].server, name: e.name ?? calls[i].name, arguments: e.arguments ?? calls[i].arguments ?? calls[i].argsStream ?? null, output: e.output ?? calls[i].output, status: "done" };
  } else if (e.phase === "error") {
    const i = idx(); if (i >= 0) calls[i] = { ...calls[i], status: "error" };
  }
  return { ...m, mcpCalls: calls };
}
