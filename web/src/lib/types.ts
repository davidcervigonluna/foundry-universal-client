import type { ChatImagePart } from "./streamClient";
export interface AttachedImage { name:string; dataUrl:string; }
export interface Citation { kind:string; title:string; url?:string|null; filename?:string|null; }
export interface McpCall { id:string|null; server:string; name:string; arguments?:string|null; argsStream?:string; output?:string|null; status:"running"|"done"|"error"; }
export interface McpTools { server:string|null; tools:string[]; }
// Unified activity timeline step.
export interface ActivityItem {
  id:string;
  kind:"thinking"|"tool"|"generating";
  tool?:string;               // web_search | file_search | code_interpreter | mcp | thinking | generating
  label:string;
  state:"running"|"done"|"error";
  detail?:string;             // e.g. query, mcp args
  server?:string; name?:string;
}
export interface Usage { inputTokens:number|null; outputTokens:number|null; totalTokens:number|null; reasoningTokens?:number|null; cachedTokens?:number|null; exact:boolean; }
export interface ChatMessage { id:string; role:"user"|"assistant"; content:string; reasoning?:string; citations?:Citation[]; mcpCalls?:McpCall[]; mcpTools?:McpTools[]; activity?:ActivityItem[]; images?:ChatImagePart[]; attachments?:AttachedImage[]; usage?:Usage; systemPromptUsed?:string; error?:boolean; }
export function newId():string{return Math.random().toString(36).slice(2)+Date.now().toString(36);}
