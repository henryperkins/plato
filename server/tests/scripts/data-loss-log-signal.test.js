import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dataLossGroups } from '../../../scripts/data-loss-log-signal.js';

describe('data-loss log signal detection', () => {
  it('detects sync write failures from entries even when the grouped sample is another route', () => {
    const logs = {
      groups: [
        {
          code: 'unhandled_error',
          count: 2,
          firstSeen: '2026-05-22T10:00:00.000Z',
          lastSeen: '2026-05-22T10:02:00.000Z',
          sources: ['buffer'],
          sample: {
            code: 'unhandled_error',
            ts: '2026-05-22T10:02:00.000Z',
            meta: { method: 'GET', path: '/v1/admin/logs', error: 'later admin failure' },
          },
        },
      ],
      entries: [
        {
          code: 'unhandled_error',
          ts: '2026-05-22T10:02:00.000Z',
          source: 'buffer',
          meta: { method: 'GET', path: '/v1/admin/logs', error: 'later admin failure' },
        },
        {
          code: 'unhandled_error',
          ts: '2026-05-22T10:00:00.000Z',
          source: 'buffer',
          meta: { method: 'PUT', path: '/v1/sync/messages%3Awp-1', error: 'item too large' },
        },
      ],
    };

    const hits = dataLossGroups(logs);

    assert.equal(hits.length, 1);
    assert.equal(hits[0].count, 1);
    assert.equal(hits[0].sample.meta.method, 'PUT');
    assert.equal(hits[0].sample.meta.path, '/v1/sync/messages%3Awp-1');
  });

  it('falls back to grouped samples when entries are not present', () => {
    const logs = {
      groups: [
        {
          code: 'unhandled_error',
          count: 4,
          firstSeen: '2026-05-22T10:00:00.000Z',
          lastSeen: '2026-05-22T10:02:00.000Z',
          sources: ['cloudwatch'],
          sample: {
            code: 'unhandled_error',
            ts: '2026-05-22T10:02:00.000Z',
            meta: { method: 'POST', path: '/v1/sync/lessonKB%3Awp-1', error: 'throttled' },
          },
        },
      ],
    };

    const hits = dataLossGroups(logs);

    assert.equal(hits.length, 1);
    assert.equal(hits[0].count, 4);
    assert.equal(hits[0].sample.meta.method, 'POST');
  });
});
