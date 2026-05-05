import { describe, it, beforeEach, after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  emitSecret,
  onSecret,
  handlerCount,
  _reset,
} from '../../../src/lib/plugins/secret-events.js';

describe('targeted plugin secret events', () => {
  let realError;
  before(() => {
    realError = console.error;
    console.error = () => {};
  });
  after(() => {
    console.error = realError;
  });

  beforeEach(() => _reset());

  it('delivers only to the requested target plugin', async () => {
    const slack = [];
    const other = [];
    onSecret('openrouter-rewards.keyAwarded', 'slack', (p) => slack.push(p));
    onSecret('openrouter-rewards.keyAwarded', 'other', (p) => other.push(p));

    await emitSecret('openrouter-rewards.keyAwarded', 'slack', { plaintext: 'sk-or-secret' });

    assert.deepEqual(slack, [{ plaintext: 'sk-or-secret' }]);
    assert.deepEqual(other, []);
  });

  it('unsubscribe removes a target handler', async () => {
    const calls = [];
    const off = onSecret('event', 'slack', (p) => calls.push(p));
    off();
    await emitSecret('event', 'slack', { ok: true });
    assert.deepEqual(calls, []);
    assert.equal(handlerCount('event', 'slack'), 0);
  });

  it('continues delivering when one handler throws', async () => {
    const calls = [];
    onSecret('event', 'slack', () => {
      throw new Error('boom');
    });
    onSecret('event', 'slack', (payload) => calls.push(payload));

    await emitSecret('event', 'slack', { ok: true });

    assert.deepEqual(calls, [{ ok: true }]);
  });
});
