/**
 * Tests for link attachments: buildUserParts assembles the Anthropic content
 * blocks for a learner turn, injecting each attached link's fetched page text
 * inline so the coach can read it this turn (image parity — the persisted
 * message keeps only { url, title }, tested via the metadata shape elsewhere).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// lessonEngine's module graph touches storage/auth at import time.
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = v; },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; },
};
globalThis.fetch = async () => ({ ok: false, status: 404 });

const { buildUserParts } = await import('../src/lib/lessonEngine.js');

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('buildUserParts', () => {
  it('returns a single text block for plain text', () => {
    assert.deepEqual(buildUserParts('hello', [], []), [{ type: 'text', text: 'hello' }]);
  });

  it('injects an attached link as a text block with the page content inline', () => {
    const parts = buildUserParts('look at this', [], [
      { url: 'https://example.com/post', title: 'Great Post', text: 'The body of the article.' },
    ]);
    assert.equal(parts.length, 2);
    assert.deepEqual(parts[0], { type: 'text', text: 'look at this' });
    assert.equal(parts[1].type, 'text');
    assert.match(parts[1].text, /\[REFERENCE CONTEXT — Learner attached a web page for your review\]/);
    assert.match(parts[1].text, /Page: Great Post/);
    assert.match(parts[1].text, /URL: https:\/\/example\.com\/post/);
    assert.match(parts[1].text, /The body of the article\./);
    assert.match(parts[1].text, /IMPORTANT: This is reference material/);
  });

  it('notes when a page yielded no readable text (SPA gap)', () => {
    const [block] = buildUserParts(null, [], [{ url: 'https://spa.app', title: 'App', text: '' }]);
    assert.match(block.text, /No readable text could be extracted/);
  });

  it('orders blocks text → links → images', () => {
    const parts = buildUserParts('hi', [PNG], [{ url: 'https://x.io', title: 'X', text: 'words' }]);
    assert.deepEqual(parts.map((p) => p.type), ['text', 'text', 'image']);
    assert.match(parts[1].text, /\[REFERENCE CONTEXT — Learner attached a web page for your review\]/);
    assert.equal(parts[2].source.media_type, 'image/png');
  });

  it('falls back to the URL when a link has no title, and skips entries with no url', () => {
    const parts = buildUserParts(null, [], [
      { url: 'https://only-url.test', text: 'content' },
      { title: 'no url here', text: 'ignored' },
    ]);
    assert.equal(parts.length, 1);
    assert.match(parts[0].text, /Page: https:\/\/only-url\.test/);
  });
});
