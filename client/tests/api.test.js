/**
 * Error surfacing in client/js/api.js. A provider failure mid-stream used to
 * be skipped, so the reply looked empty and the next send tripped the server's
 * empty-content check instead of reporting the real cause.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, parseResponse, parseSSEStream, withoutEmptyMessages } from '../js/api.js';

const sse = (...events) => new Response(events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('')).body;
const delta = (text) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text } });

async function collect(body) {
  let text = '';
  for await (const chunk of parseSSEStream(body)) text += chunk;
  return text;
}

describe('parseSSEStream', () => {
  it('yields text deltas until [DONE]', async () => {
    assert.equal(await collect(sse(delta('Nice '), delta('work.'), '[DONE]')), 'Nice work.');
  });

  it('throws the classified error instead of ending quietly', async () => {
    await assert.rejects(
      collect(sse({ type: 'error', error: { code: 'ai_unavailable', message: 'The AI service is unavailable.' } })),
      (err) => err instanceof ApiError && err.code === 'ai_unavailable' && err.message === 'The AI service is unavailable.',
    );
  });

  it('keeps text that arrived before a mid-stream failure out of a silent success', async () => {
    const seen = [];
    await assert.rejects(async () => {
      for await (const chunk of parseSSEStream(sse(delta('Half a '), { type: 'error', error: { code: 'ai_timeout' } }))) seen.push(chunk);
    }, (err) => err.code === 'ai_timeout');
    assert.deepEqual(seen, ['Half a ']);
  });
});

describe('parseResponse', () => {
  it('carries the server code on a rejected request', async () => {
    const resp = new Response(JSON.stringify({ error: 'messages must have non-empty content', code: 'empty_message' }), { status: 400 });
    await assert.rejects(parseResponse(resp), (err) => err.status === 400 && err.code === 'empty_message');
  });
});

describe('withoutEmptyMessages', () => {
  it('drops blank turns a failed reply could leave behind', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: '   ' },
      { role: 'assistant', content: [] },
      { role: 'user', content: [{ type: 'text', text: 'Again' }] },
    ];
    assert.deepEqual(withoutEmptyMessages(messages), [messages[0], messages[3]]);
    assert.deepEqual(withoutEmptyMessages(undefined), []);
  });
});
