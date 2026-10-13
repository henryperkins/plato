import test from 'node:test';
import assert from 'node:assert/strict';
import { launchConfetti } from '../src/lib/confetti.js';

test('reduced motion preserves completion without creating decorative confetti', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let touches = 0;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  globalThis.document = { getElementById: () => { touches++; throw new Error('Decoration must be skipped'); } };
  try {
    launchConfetti();
    assert.equal(touches, 0);
  } finally {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  }
});
