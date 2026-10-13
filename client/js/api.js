/**
 * AI API utilities — parsing and streaming helpers.
 * All API calls go through the server proxy (authenticatedFetch).
 */

// The single model behind every agent. Must match `LLM` in
// server/src/lib/ai-provider.js, which resolves it to a Bedrock model ID.
export const LLM = 'qwen3-vl-235b';

export class ApiError extends Error {
  constructor(type, message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.type = type;   // 'invalid_key' | 'rate_limit' | 'network' | 'parse' | 'api' | 'empty_response'
    this.status = status;
    // Server classification (e.g. 'ai_unavailable', 'empty_message'), which
    // client/src/lib/aiErrors.js turns into contextual copy.
    this.code = code;
  }
}

/**
 * Drop messages with no content. The AI route rejects them, as Bedrock would,
 * and an empty turn left by a failed reply should not block the next send.
 */
export function withoutEmptyMessages(messages) {
  return (messages || []).filter((m) => (typeof m.content === 'string'
    ? m.content.trim().length > 0
    : Array.isArray(m.content) && m.content.length > 0));
}

/**
 * Parse a Messages API response.
 * Expects a fetch Response object. Returns { content, usage }.
 */
export async function parseResponse(resp) {
  if (!resp.ok) {
    const status = resp.status;
    let body;
    try { body = await resp.json(); } catch { body = {}; }
    const msg = body?.error?.message || body?.error || `API returned ${status}`;
    const code = body?.code || body?.error?.code;

    if (status === 401) throw new ApiError('invalid_key', 'Session expired. Please sign in again.', status, code);
    if (status === 429) throw new ApiError('rate_limit', 'Rate limited. Try again in a moment.', status, code);
    if (status === 503 || status === 529) throw new ApiError('overloaded', 'API is temporarily overloaded. Retrying...', status, code);
    if (status === 500) throw new ApiError('api', 'Internal server error. This may be a temporary issue.', status, code);
    throw new ApiError('api', msg, status, code);
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new ApiError('parse', 'Failed to parse API response.');
  }

  const textBlock = data.content?.find(b => b.type === 'text');
  if (!textBlock) throw new ApiError('parse', 'No text content in API response.');

  if (data.stop_reason === 'max_tokens') {
    console.warn('[plato] Response truncated — max_tokens reached. Output may be incomplete.');
  }

  return { content: textBlock.text, usage: data.usage };
}

/**
 * Parse an SSE stream from the Messages API proxy.
 * Yields text delta strings as they arrive.
 */
export async function* parseSSEStream(body, onDone) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') return;

        let event;
        try { event = JSON.parse(data); } catch { continue; }

        // A provider failure mid-stream. Ignoring it used to make the reply
        // look empty, and the empty turn then tripped the server's
        // empty-content check on the next send, hiding the real cause.
        if (event.type === 'error') {
          throw new ApiError('api', event.error?.message || 'The AI service failed to respond.', undefined, event.error?.code);
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }
  } finally {
    reader.releaseLock();
    onDone?.();
  }
}
