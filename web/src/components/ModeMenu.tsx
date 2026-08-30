import { type ConnectionProfile, type ProjectDest, saveActive } from "../lib/connectionProfile";
interface Props { connection: ConnectionProfile; onChanged: () => void; }
export function ModeMenu({ connection, onChanged }: Props) {
  const dest: ProjectDest = connection.dest ?? "playground";
  const setDest = (d: ProjectDest) => {
    if (d === dest) return;
    // Switching mode clears the previous destination selection so the picker
    // shows "select model"/"select agent" again (no stale last choice).
    saveActive({ ...connection, dest: d, model: undefined, agentEndpoint: undefined, agentId: undefined });
    onChanged();
  };
  return (
    <div className="mode-menu">
      <button className={dest === "playground" ? "active" : ""} onClick={() => setDest("playground")}>🎛 Playground</button>
      <button className={dest === "agent" ? "active" : ""} onClick={() => setDest("agent")}>🤖 Agents</button>
    </div>
  );
}
