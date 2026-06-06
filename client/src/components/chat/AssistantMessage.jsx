import { renderMd } from '../../lib/helpers.js';

export default function AssistantMessage({ content, streaming = false }) {
  let text = content;
  try {
    const parsed = JSON.parse(content);
    text = parsed.message || content;
  } catch { /* plain text */ }

  // While streaming, the partial text is hidden from screen readers
  // (`aria-hidden`) — so it must also be unfocusable and excluded from chat
  // keyboard nav, otherwise focus can land on an aria-hidden element (an
  // accessibility violation the browser blocks). Once persisted (not
  // streaming) it becomes a normal, navigable message.
  return (
    <div className="flex justify-start"
      data-chat-message={streaming ? undefined : 'assistant'}
      tabIndex={streaming ? undefined : -1}
      aria-hidden={streaming || undefined}
    >
      <span className="sr-only">Coach says: </span>
      <div className="max-w-[85%] px-1 py-2 text-base prose prose-base prose-neutral dark:prose-invert font-serif">
        <div dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
      </div>
    </div>
  );
}
