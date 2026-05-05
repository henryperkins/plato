import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState,
  normalizeState,
  pruneStaleAwardReservations,
  reserveAward,
  clearReservation,
  markReservationExternalSucceeded,
  finalizeAwardReservation,
} from './state.js';

describe('OpenRouter reward state machine', () => {
  it('normalizeState strips legacy OAuth-era fields', () => {
    const legacy = {
      pendingClaim: { ruleIds: ['r1'], reservationIds: [], accumulatedAmount: 5, qualifiedAt: 't', claimFingerprint: 'sha256:abc' },
      oauthSessions: [{ stateHash: 'sha256:x', codeChallenge: 'c', claimFingerprint: 'sha256:abc', createdAt: 't', expiresAt: 't+10' }],
      openrouterUserId: 'or_user_123',
      keyHash: 'hash_1',
      lifetimeAwarded: 5,
      firedRuleIds: ['r1'],
    };
    const normalized = normalizeState(legacy);
    assert.equal(normalized.pendingClaim, undefined, 'pendingClaim should be dropped');
    assert.equal(normalized.oauthSessions, undefined, 'oauthSessions should be dropped');
    assert.equal(normalized.openrouterUserId, undefined, 'openrouterUserId should be dropped');
    assert.equal(normalized.keyHash, 'hash_1');
    assert.equal(normalized.lifetimeAwarded, 5);
    assert.deepEqual(normalized.firedRuleIds, ['r1']);
  });

  it('pruneStaleAwardReservations drops reserved-phase award reservations past the TTL', () => {
    const now = new Date('2026-05-05T12:30:00.000Z');
    const state = {
      ...emptyState(),
      reservations: [
        // Stale reserved award (older than 5min) — drop.
        { id: 'stale-award', kind: 'award', phase: 'reserved', ruleIds: ['r1'], amount: 1, createdAt: '2026-05-05T12:00:00.000Z' },
        // Fresh reserved award (within window) — keep.
        { id: 'fresh-award', kind: 'award', phase: 'reserved', ruleIds: ['r2'], amount: 1, createdAt: '2026-05-05T12:29:00.000Z' },
        // External-succeeded award (irreversible side effect) — keep regardless of age.
        { id: 'external-award', kind: 'award', phase: 'external-succeeded', ruleIds: ['r3'], amount: 1, createdAt: '2025-01-01T00:00:00.000Z' },
        // Non-award reservation (e.g. reissue tracked elsewhere but if present in reservations) — keep.
        { id: 'reissue', kind: 'reissue', phase: 'reserved', ruleIds: [], amount: 0, createdAt: '2025-01-01T00:00:00.000Z' },
      ],
    };
    const next = pruneStaleAwardReservations(state, { now });
    const ids = next.reservations.map((r) => r.id);
    assert.deepEqual(ids.sort(), ['external-award', 'fresh-award', 'reissue']);
  });

  it('pruneStaleAwardReservations also strips legacy fields via normalizeState', () => {
    const next = pruneStaleAwardReservations({
      pendingClaim: { ruleIds: ['x'], accumulatedAmount: 1, qualifiedAt: 't' },
      reservations: [],
    }, { now: new Date('2026-05-05T12:00:00.000Z') });
    assert.equal(next.pendingClaim, undefined);
  });

  it('does not clear a reservation after an external side effect succeeds', () => {
    const state = reserveAward(emptyState(), [{ id: 'rule-1', creditAmount: 5 }], {
      amount: 5,
      targetLimit: 5,
      reservationId: 'res-1',
      createdAt: '2026-05-05T12:00:00.000Z',
    });
    const afterExternal = markReservationExternalSucceeded(state, 'res-1', { keyHash: 'hash_1' });

    assert.throws(
      () => clearReservation(afterExternal, 'res-1', { externalSucceeded: true }),
      /must not clear/
    );
  });

  it('finalizes a reservation exactly once', () => {
    const state = reserveAward(emptyState(), [{ id: 'rule-1', creditAmount: 5 }], {
      amount: 5,
      targetLimit: 5,
      reservationId: 'res-1',
      createdAt: '2026-05-05T12:00:00.000Z',
    });

    const next = finalizeAwardReservation(state, 'res-1', {
      keyHash: 'hash_1',
      awardedAt: '2026-05-05T12:01:00.000Z',
    });

    assert.deepEqual(next.firedRuleIds, ['rule-1']);
    assert.equal(next.lifetimeAwarded, 5);
    assert.equal(next.keyHash, 'hash_1');
    assert.equal(next.reservations.length, 0);
  });
});
