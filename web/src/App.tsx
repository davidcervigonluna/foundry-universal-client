import { useState, useEffect } from "react";
import { Chat } from "./components/Chat";
import { LoginScreen } from "./components/LoginScreen";
import { EntraIdentityPicker } from "./components/EntraIdentityPicker";
import { AnonSetup } from "./components/AnonSetup";
import { SettingsModal } from "./components/SettingsModal";
import { HistorySidebar } from "./components/HistorySidebar";
import { SystemPromptPanel } from "./components/SystemPromptPanel";
import { DestinationBar } from "./components/DestinationBar";
import { ModeMenu } from "./components/ModeMenu";
import { loadActive, clearActive, isChatReady, promptApplies as promptAppliesFn, type ConnectionProfile } from "./lib/connectionProfile";
import { newId, type ChatMessage } from "./lib/types";
import type { Conversation } from "./lib/historyDb";
import { subscribe, callsLastMinute } from "./lib/rateMeter";
import { getAppMode, setAppMode, resetAppMode } from "./lib/appMode";
import { type EntraProfile, setActiveEntraProfile, getActiveEntraProfile, clearActiveEntraProfile } from "./lib/entraProfiles";
import { loginWithProfile, logoutActive } from "./lib/entraAuth";

type SidePanel = "none" | "history" | "prompt";
type EntraStage = "identity" | "in";

export default function App() {
  const [mode, setMode] = useState(getAppMode());
  const [entraStage, setEntraStage] = useState<EntraStage>(getActiveEntraProfile() ? "in" : "identity");
  const [identity, setIdentity] = useState<EntraProfile | null>(getActiveEntraProfile());
  const [active, setActive] = useState<ConnectionProfile | null>(loadActive());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(newId());
  const [initialMessages, setInitialMessages] = useState<ChatMessage[] | undefined>(undefined);
  const [chatKey, setChatKey] = useState(0);
  const [side, setSide] = useState<SidePanel>("none");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [cpm, setCpm] = useState(0);
  const [systemPrompt, setSystemPrompt] = useState<string>("");

  useEffect(() => { setCpm(callsLastMinute()); return subscribe(setCpm); }, []);
  useEffect(() => { if (mode === "entra" && entraStage === "in" && !active) setSettingsOpen(true); }, [mode, entraStage]);

  const isAnon = mode === "anon";
  const promptApplies = mode === "entra" && promptAppliesFn(active);
  useEffect(() => { if (!promptApplies && side === "prompt") setSide("none"); }, [promptApplies, side]);

  const chooseAnon = () => { setAppMode("anon"); setMode("anon"); };
  const chooseEntra = () => { setAppMode("entra"); setMode("entra"); setEntraStage(getActiveEntraProfile() ? "in" : "identity"); };
  const doEntraLogin = async (p: EntraProfile) => {
    const acc = await loginWithProfile(p);
    setActiveEntraProfile({ ...p, name: p.name || acc.username || p.tenantId });
    setIdentity(getActiveEntraProfile());
    setEntraStage("in");
  };
  const backToLogin = () => { resetAppMode(); clearActive(); setActive(null); setMode("login"); };
  const signOut = async () => { try { await logoutActive(); } catch {} clearActiveEntraProfile(); clearActive(); resetAppMode(); setIdentity(null); setActive(null); setEntraStage("identity"); setMode("login"); };
  const switchIdentity = () => { setEntraStage("identity"); };

  const newChat = () => { setConversationId(newId()); setInitialMessages(undefined); setChatKey((k) => k + 1); };
  const openConversation = (c: Conversation) => { setConversationId(c.id); setInitialMessages(c.messages); setChatKey((k) => k + 1); setSide("none"); };
  const onSaved = () => setActive(loadActive());
  const toggle = (p: SidePanel) => setSide((cur) => (cur === p ? "none" : p));
  const onDestChanged = () => setActive(loadActive());

  const ready = isChatReady(active);
  const readyHint = !active ? (isAnon ? "Configure the agent →" : "Open ⚙️ and configure the project →")
    : (active.kind === "project" && (active.dest ?? "playground") === "playground" && !active.model) ? "Choose a model ↑"
    : (active.kind === "project" && active.dest === "agent" && !active.agentEndpoint) ? "Choose an agent ↑"
    : "Configure a connection →";

  if (mode === "login") return <LoginScreen onAnon={chooseAnon} onEntra={chooseEntra} />;
  if (mode === "entra" && entraStage === "identity") return <EntraIdentityPicker onLogin={doEntraLogin} onBack={backToLogin} />;
  if (mode === "anon" && !active) return <AnonSetup onReady={() => setActive(loadActive())} onBack={backToLogin} />;

  const projectLabel = active?.label || (active?.endpoint ? (() => { try { return new URL(active.endpoint).pathname.split("/").pop(); } catch { return ""; } })() : "");

  return (
    <div className="app">
      <header className="topbar">
        {/* LEFT: brand + history + prompt + new chat */}
        <div className="topbar-left">
          <div className="brand"><span className="logo">◆</span> Foundry Universal Client</div>
          {!isAnon && <button className={`btn-ghost ${side === "history" ? "on" : ""}`} onClick={() => toggle("history")}>☰ History</button>}
          {promptApplies && <button className={`btn-ghost ${side === "prompt" ? "on" : ""}`} onClick={() => toggle("prompt")}>🎚 Prompt</button>}
          <button className="btn-newchat" onClick={newChat}>＋ New chat</button>
        </div>

        {/* CENTER: calls counter */}
        <div className="topbar-center">
          <span className="cpm-badge" title="API calls in the last minute (this session)">⚡ {cpm}/min</span>
        </div>

        {/* RIGHT: gear → project → mode selector → destination → identity */}
        <div className="topbar-right">
          {isAnon ? (
            <>
              <span className="mode-badge">🕶️ anonymous</span>
              {active && <span className="mode-badge">🤖 agent</span>}
              <button className="btn-link" onClick={backToLogin}>Exit</button>
            </>
          ) : (
            <>
              <button className="icon-btn" title="Project settings" onClick={() => setSettingsOpen(true)}>⚙️</button>
              {projectLabel && <span className="project-chip">🗂 {projectLabel}</span>}
              {active && <ModeMenu connection={active} onChanged={onDestChanged} />}
              {active && <DestinationBar connection={active} onChanged={onDestChanged} />}
              <div className="user-chip" title={identity?.name}>
                <span>👤 {identity?.name || "user"}</span>
                <button className="btn-link" onClick={switchIdentity} title="Switch identity">⇄</button>
                <button className="btn-link" onClick={signOut}>Sign out</button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="body">
        {!isAnon && <HistorySidebar open={side === "history"} activeId={conversationId} currentEndpoint={active?.endpoint} onSelect={openConversation} onClose={() => setSide("none")} refreshKey={historyRefresh} />}
        {promptApplies && <SystemPromptPanel open={side === "prompt"} value={systemPrompt} onChange={setSystemPrompt} onClose={() => setSide("none")} />}
        <Chat key={chatKey} ready={ready} readyHint={readyHint} conversationId={conversationId} initialMessages={initialMessages} systemPrompt={systemPrompt} promptActive={promptApplies} persist={!isAnon} onPersisted={() => setHistoryRefresh((k) => k + 1)} />
      </div>
      {!isAnon && <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={onSaved} />}
    </div>
  );
}
