import { memo } from "react";
import type { ChatMessage } from "../lib/types";
import { GeneratedImage } from "./GeneratedImage";
import { ReasoningPanel, UsageBadge, PromptUsed } from "./TracePanels";
import { ActivityTimeline, LiveStatus } from "./ActivityTimeline";
import { MarkdownWithCitations } from "./MarkdownWithCitations";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MC({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const hasActivity = !!message.activity?.length;
  const hasCites = !!message.citations?.length;
  const showDots = isStreaming && !message.content && !message.images?.length && !message.reasoning && !hasActivity;
  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-assistant"}`}>
      <div className="msg-avatar">{isUser ? "🧑" : "🤖"}</div>
      <div className={`msg-bubble ${message.error ? "msg-error" : ""}`}>
        {showDots && <span className="typing"><i /><i /><i /></span>}
        {message.attachments && message.attachments.length > 0 && (<div className="attach-grid">{message.attachments.map((a, i) => <img key={i} className="attach-thumb" src={a.dataUrl} alt={a.name} title={a.name} />)}</div>)}
        {isUser && message.systemPromptUsed && <PromptUsed text={message.systemPromptUsed} />}
        {!isUser && isStreaming && hasActivity && <LiveStatus activity={message.activity} />}
        {!isUser && hasActivity && <ActivityTimeline activity={message.activity!} />}
        {!isUser && message.reasoning && <ReasoningPanel text={message.reasoning} />}
        {/* Content: with inline citations for assistant, plain markdown for user */}
        {message.content && (
          !isUser
            ? <MarkdownWithCitations msgId={message.id} content={message.content} citations={hasCites ? message.citations : undefined} />
            : <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
        )}
        {message.images?.map((img, i) => <GeneratedImage key={`${message.id}-img-${i}`} image={img} />)}
        {!isUser && message.usage && <UsageBadge usage={message.usage} />}
      </div>
    </div>
  );
}
export const Message = memo(MC, (a, b) =>
  a.message.id === b.message.id &&
  a.message.content === b.message.content &&
  a.message.reasoning === b.message.reasoning &&
  (a.message.images?.length ?? 0) === (b.message.images?.length ?? 0) &&
  (a.message.attachments?.length ?? 0) === (b.message.attachments?.length ?? 0) &&
  (a.message.citations?.length ?? 0) === (b.message.citations?.length ?? 0) &&
  (a.message.activity?.length ?? 0) === (b.message.activity?.length ?? 0) &&
  (a.message.activity?.map((x) => x.state + (x.detail?.length ?? 0)).join() ?? "") === (b.message.activity?.map((x) => x.state + (x.detail?.length ?? 0)).join() ?? "") &&
  a.message.usage === b.message.usage &&
  a.isStreaming === b.isStreaming
);
