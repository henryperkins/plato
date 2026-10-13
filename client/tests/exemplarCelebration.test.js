import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { celebrateExemplar } from '../src/lib/exemplarCelebration.js';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
let motion;
let check;
let animation;
let calls;
let cancellations;

class ObservableTarget extends EventTarget {
  listeners = new Set();
  addEventListener(type, listener) {
    this.listeners.add(listener);
    super.addEventListener(type, listener);
  }
  removeEventListener(type, listener) {
    this.listeners.delete(listener);
    super.removeEventListener(type, listener);
  }
}

beforeEach(() => {
  motion = Object.assign(new ObservableTarget(), { matches: false });
  globalThis.window = { matchMedia: () => motion };
  globalThis.document = Object.assign(new ObservableTarget(), { hidden: false });
  calls = [];
  cancellations = 0;
  animation = { cancel: () => { cancellations++; animation.oncancel?.(); } };
  check = { animate: (...args) => { calls.push(args); return animation; } };
});

afterEach(() => {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
});

describe('exemplar completion feedback', () => {
  it('keeps the static acknowledgement when reduced motion is requested', () => {
    motion.matches = true;
    celebrateExemplar(check)();
    assert.equal(calls.length, 0);
    assert.equal(motion.listeners.size, 0);
  });

  it('does not start a hidden-tab celebration or require animation support', () => {
    document.hidden = true;
    celebrateExemplar(check)();
    assert.equal(calls.length, 0);
    document.hidden = false;
    assert.doesNotThrow(() => celebrateExemplar(null)());
    assert.doesNotThrow(() => celebrateExemplar({})());
  });

  it('draws one bounded check and releases listeners after finishing', () => {
    const stop = celebrateExemplar(check);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].at(-1).strokeDashoffset, 0);
    assert.ok(calls[0][1].duration <= 800);
    animation.onfinish();
    stop();
    assert.equal(cancellations, 1);
    assert.equal(motion.listeners.size, 0);
    assert.equal(document.listeners.size, 0);
  });

  it('cancels when the preference changes without replaying when it changes back', () => {
    celebrateExemplar(check);
    motion.matches = true;
    motion.dispatchEvent(new Event('change'));
    motion.matches = false;
    motion.dispatchEvent(new Event('change'));
    assert.equal(cancellations, 1);
    assert.equal(calls.length, 1);
    assert.equal(document.listeners.size, 0);
  });

  it('cancels on backgrounding and makes unmount cleanup idempotent', () => {
    const stop = celebrateExemplar(check);
    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    stop();
    assert.equal(cancellations, 1);
    assert.equal(motion.listeners.size, 0);
    assert.equal(document.listeners.size, 0);
  });

  it('cancels immediately when the component unmounts', () => {
    const stop = celebrateExemplar(check);
    stop();
    assert.equal(cancellations, 1);
    assert.equal(document.listeners.size, 0);
    assert.equal(motion.listeners.size, 0);
  });
});
