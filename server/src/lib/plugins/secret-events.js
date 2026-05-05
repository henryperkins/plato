import { logger } from '../logger.js';

const handlers = new Map();

function keyFor(event, targetPluginId) {
  return `${event}\0${targetPluginId}`;
}

export function onSecret(event, targetPluginId, fn) {
  if (typeof event !== 'string' || !event) throw new Error('event required');
  if (typeof targetPluginId !== 'string' || !targetPluginId) throw new Error('targetPluginId required');
  if (typeof fn !== 'function') throw new Error('handler must be a function');
  const key = keyFor(event, targetPluginId);
  if (!handlers.has(key)) handlers.set(key, []);
  const entry = { fn, targetPluginId };
  handlers.get(key).push(entry);
  return () => {
    const list = handlers.get(key);
    if (!list) return;
    const idx = list.indexOf(entry);
    if (idx >= 0) list.splice(idx, 1);
  };
}

export async function emitSecret(event, targetPluginId, payload) {
  const key = keyFor(event, targetPluginId);
  for (const entry of [...(handlers.get(key) || [])]) {
    try {
      await entry.fn(payload);
    } catch (err) {
      logger.error('plugin_secret_event_failed', {
        event,
        targetPluginId,
        error: err?.message || String(err),
        stack: err?.stack,
      });
    }
  }
}

export function handlerCount(event, targetPluginId) {
  return (handlers.get(keyFor(event, targetPluginId)) || []).length;
}

export function _reset() {
  handlers.clear();
}
