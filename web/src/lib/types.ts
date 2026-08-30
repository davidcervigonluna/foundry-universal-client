import type { ChatImagePart } from "./streamClient";
export interface AttachedImage { name:string; dataUrl:string; }
export interface Citation { kind:string; title:string; url?:string|null; filename?:string|null; }
export interface McpCall {
  id:string|null; server:string; name:string;
  arguments?:string|null;   // final arguments (JSON string)
  argsStream?:string;        // arguments being built (streamed deltas)
  output?:string|null;
  status:"running"|"done"|"error";
}
// Discovered MCP tools (from mcp_list_tools).
export interface McpTools { server:string|null; tools:string[]; }
export interface Usage { inputTokens:number|null; outputTokens:number|null; totalTokens:number|null; reasoningTokens?:number|null; cachedTokens?:number|null; exact:boolean; }
export interface ChatMessage { id:string; role:"user"|"assistant"; content:string; reasoning?:string; citations?:Citation[]; mcpCalls?:McpCall[]; mcpTools?:McpTools[]; images?:ChatImagePart[]; attachments?:AttachedImage[]; usage?:Usage; systemPromptUsed?:string; error?:boolean; }
export function newId():string{return Math.random().toString(36).slice(2)+Date.now().toString(36);}
