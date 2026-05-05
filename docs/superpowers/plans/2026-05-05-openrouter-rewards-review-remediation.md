# OpenRouter Rewards Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the OpenRouter Rewards plugin design and implementation against OAuth account-binding attacks, duplicate award loss, non-idempotent external side effects, and plaintext leakage on the open plugin hook bus.

**Architecture:** Keep lesson completion semantics unchanged: the plugin reacts only after `applyCoachResponseToKB` marks a lesson complete. Add a server-bound OAuth session state, a durable award/reissue operation state machine, and a targeted secret-delivery plugin hook surface so plaintext OpenRouter keys are delivered only through in-app reveal or an explicitly allowed Slack handler.

**Tech Stack:** React 19 + Vite plugin slots, Node.js + Hono plugin routes, DynamoDB/SQLite sync-data via plugin SDK user metadata, `node:test`, Plato plugin manifest/schema/API versioning.

---

## Review Finding Coverage

| Finding | Complete Fix |
|---|---|
| OAuth PKCE flow lacks `state` binding | Add `POST /oauth/start`, server-recorded one-time `stateHash`, claim fingerprint, PKCE challenge binding, expiry, and callback validation before exchanging the OAuth code. |
| Duplicate completion mounts can hide an already-earned claim | Return existing `pendingClaim` before rule evaluation; add route tests proving repeated mounts preserve `pending-oauth` instead of `no-claim`. |
| Side-effect recovery can double-mint or double-top-up | Reserve operations before external calls; model external success separately; use absolute top-up limits; never clear a reservation after an external call succeeds; compensate or reconcile orphan keys. |
| Plaintext key emitted on open hook bus | Replace plaintext open-bus events with targeted secret events. Slack receives plaintext only through a manifest-declared secret handler; public/open events contain non-secret delivery summaries only. |

## File Structure

Create:

- `server/src/lib/plugins/secret-events.js` - targeted in-process event delivery for sensitive plugin payloads.
- `server/tests/lib/plugins/secret-events.test.js` - unit coverage for targeted delivery, unsubscribe, and error isolation.
- `plugins/openrouter-rewards/plugin.json` - manifest using the new slots, routes, user metadata, and secret-event emission capabilities.
- `plugins/openrouter-rewards/server/state.js` - pure state transitions for pending claims, reservations, finalization, compensation, and reissue.
- `plugins/openrouter-rewards/server/state.test.js` - state-machine regression tests for findings 2 and 3.
- `plugins/openrouter-rewards/server/oauth-state.js` - PKCE/state generation, hashing, claim fingerprinting, and validation.
- `plugins/openrouter-rewards/server/oauth-state.test.js` - OAuth login CSRF/account-binding regression tests.
- `plugins/openrouter-rewards/server/openrouter-client.js` - OpenRouter API wrapper.
- `plugins/openrouter-rewards/server/openrouter-client.test.js` - mocked OpenRouter API contract tests.
- `plugins/openrouter-rewards/server/index.js` - Hono routes and external-side-effect orchestration.
- `plugins/openrouter-rewards/server/index.test.js` - route-level tests for auth, idempotency, OAuth, top-up, reissue, and revoke.
- `plugins/openrouter-rewards/client/index.js` - slot exports.
- `plugins/openrouter-rewards/client/AdminSettingsPanel.jsx` - reward configuration UI.
- `plugins/openrouter-rewards/client/AdminProfileFields.jsx` - admin learner status/reissue/revoke UI.
- `plugins/openrouter-rewards/client/LearnerCompletionAfter.jsx` - post-completion claim UI.
- `plugins/openrouter-rewards/client/LearnerHomeBanner.jsx` - OAuth callback and pending claim UI.
- `plugins/openrouter-rewards/client/LearnerProfileFields.jsx` - learner status/reissue UI.
- `plugins/slack/server/openrouter-delivery.js` - Slack secret handler for OpenRouter key delivery.
- `plugins/slack/server/openrouter-delivery.test.js` - Slack opt-in, no-user, and fail-open tests.

Modify:

- `docs/superpowers/specs/2026-05-05-openrouter-rewards-plugin-design.md` - incorporate the hardened OAuth, idempotency, and secret-event decisions.
- `server/src/lib/plugins/sdk.js` - add version-aware user meta helpers and non-subscription secret event emit support.
- `server/src/lib/plugins/registry.js` - register/unregister manifest-declared secret handlers for enabled plugins.
- `server/src/lib/plugins/manifest.js` - validate `extensionPoints.secretEvents`.
- `server/src/lib/plugins/capabilities.js` - add secret-event capability derivation.
- `server/src/lib/plugins/version.js` - bump `PLUGIN_API_VERSION`.
- `server/src/routes/me.js` - list the new learner slots and secret-event capability vocabulary.
- `docs/plugins/plugin.schema.json` - schema support for `learnerCompletionAfter` and `secretEvents`.
- `docs/plugins/EXTENSION_REFERENCE.md` - document learner slots, secret events, and payload restrictions.
- `docs/plugins/CAPABILITIES.md` - document secret-event capabilities and plaintext restrictions.
- `docs/plugins/API_VERSIONING.md` - record the plugin API bump.
- `packages/plugin-sdk/index.d.ts` - add types for learner completion slot, secret events, and versioned user meta.
- `plugins/slack/plugin.json` - declare the OpenRouter secret handler capability.
- `plugins/slack/server/index.js` - export the OpenRouter secret handler without registering open-bus subscriptions.

## Target Contracts

Use these exact contracts throughout the implementation:

```js
// server/src/lib/plugins/sdk.js
export async function getUserMetaWithVersion(userId, pluginId) {
  const item = await dbDefault.getSyncData(userId, `userMeta:${pluginId}`);
  return { data: item?.data || null, version: item?.version || 0 };
}

export async function putUserMetaConditional(userId, pluginId, data, expectedVersion) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('data must be an object');
  }
  return dbDefault.putSyncData(userId, `userMeta:${pluginId}`, data, expectedVersion || 0);
}
```

```js
// server/src/lib/plugins/secret-events.js
export function onSecret(event, targetPluginId, fn) {
  if (typeof event !== 'string' || !event) throw new Error('event required');
  if (typeof targetPluginId !== 'string' || !targetPluginId) throw new Error('targetPluginId required');
  if (typeof fn !== 'function') throw new Error('handler must be a function');
  const key = `${event}\0${targetPluginId}`;
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
  const key = `${event}\0${targetPluginId}`;
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
```

```js
// OpenRouter user metadata shape additions.
{
  "pendingClaim": {
    "ruleIds": ["rule-1"],
    "reservationIds": ["res-award-1"],
    "accumulatedAmount": 5,
    "qualifiedAt": "2026-05-05T12:00:00.000Z",
    "claimFingerprint": "sha256:..."
  },
  "oauthSessions": [
    {
      "stateHash": "sha256:...",
      "codeChallenge": "base64url...",
      "claimFingerprint": "sha256:...",
      "createdAt": "2026-05-05T12:01:00.000Z",
      "expiresAt": "2026-05-05T12:11:00.000Z"
    }
  ],
  "reservations": [
    {
      "id": "res-award-1",
      "kind": "award",
      "phase": "reserved",
      "ruleIds": ["rule-1"],
      "amount": 5,
      "targetLimit": 5,
      "createdAt": "2026-05-05T12:00:00.000Z"
    }
  ],
  "reissueReservation": null
}
```

## Task 1: Update the Design Spec With Hardened Contracts

**Files:**
- Modify: `docs/superpowers/specs/2026-05-05-openrouter-rewards-plugin-design.md`

- [ ] **Step 1: Patch OAuth flow text**

Replace the client-only OAuth start with this sequence:

```text
1. Client generates code_verifier and code_challenge.
2. Client calls POST /v1/plugins/openrouter-rewards/oauth/start with { codeChallenge }.
3. Server verifies the learner has a pendingClaim, computes claimFingerprint, stores { stateHash, codeChallenge, claimFingerprint, expiresAt } in userMeta, and returns { authorizationUrl, state }.
4. Client stores code_verifier in sessionStorage as or-pkce-verifier:<state> and redirects to authorizationUrl.
5. OpenRouter redirects back with ?code=...&state=...
6. LearnerHomeBanner reads state, loads and removes or-pkce-verifier:<state>, and calls POST /claim with { code, state, codeVerifier }.
7. Server hashes state, consumes a non-expired session for this user, verifies the stored codeChallenge matches codeVerifier, verifies pendingClaim.claimFingerprint still matches, then exchanges the OAuth code.
```

- [ ] **Step 2: Patch duplicate mount and reservation text**

Add these rules to `Hot Path: POST /check-pending`:

```text
- If state.pendingClaim exists, return pending-oauth before evaluating new rules.
- If an award reservation exists with phase reserved or external-succeeded, return processing and do not create another reservation.
- Only call clearReservation for failures that happen before any OpenRouter mutation succeeds.
- After an OpenRouter mutation succeeds, retry finalization from latest metadata; if persistence remains unavailable, run the documented compensation path instead of clearing the reservation.
```

- [ ] **Step 3: Patch plaintext event-bus text**

Replace `openrouter-rewards.keyAwarded` open-bus plaintext delivery with:

```text
OpenRouter Rewards never emits plaintext on the open plugin hook bus. For Slack delivery, the core plugin host provides targeted secret events. Slack declares a manifest secret handler for openrouter-rewards.keyAwarded. The OpenRouter plugin calls emitSecret('openrouter-rewards.keyAwarded', 'slack', payload). Only the enabled Slack plugin's registered secret handler receives the plaintext payload. The public/open event, if emitted, contains only { userId, keyHashSuffix, deliveryAttemptId, status }.
```

- [ ] **Step 4: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-05-05-openrouter-rewards-plugin-design.md
```

Expected: no output and exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-05-openrouter-rewards-plugin-design.md
git commit -m "docs: harden OpenRouter rewards design"
```

## Task 2: Add Versioned User Metadata and Targeted Secret Events to Core

**Files:**
- Create: `server/src/lib/plugins/secret-events.js`
- Create: `server/tests/lib/plugins/secret-events.test.js`
- Modify: `server/src/lib/plugins/sdk.js`
- Modify: `server/src/lib/plugins/registry.js`
- Modify: `server/src/lib/plugins/manifest.js`
- Modify: `server/src/lib/plugins/capabilities.js`
- Modify: `server/src/lib/plugins/version.js`
- Modify: `server/src/routes/me.js`
- Modify: `docs/plugins/plugin.schema.json`
- Modify: `docs/plugins/EXTENSION_REFERENCE.md`
- Modify: `docs/plugins/CAPABILITIES.md`
- Modify: `docs/plugins/API_VERSIONING.md`
- Modify: `packages/plugin-sdk/index.d.ts`
- Test: `server/tests/lib/plugins/sdk-user-meta.test.js`
- Test: `server/tests/lib/plugins/manifest.test.js`
- Test: `server/tests/lib/plugins/capabilities.test.js`

- [ ] **Step 1: Write failing SDK metadata tests**

Add to `server/tests/lib/plugins/sdk-user-meta.test.js`:

```js
it('getUserMetaWithVersion returns data and version', async () => {
  await putUserMeta('usr_x', 'demo', { count: 1 });
  const out = await getUserMetaWithVersion('usr_x', 'demo');
  assert.deepEqual(out, { data: { count: 1 }, version: 1 });
});

it('putUserMetaConditional rejects stale versions', async () => {
  await putUserMeta('usr_x', 'demo', { count: 1 });
  await assert.rejects(
    () => putUserMetaConditional('usr_x', 'demo', { count: 2 }, 0),
    /conflict|ConditionalCheckFailedException/
  );
});
```

Update the import:

```js
import {
  getUserMeta,
  putUserMeta,
  deleteUserMeta,
  getUserMetaWithVersion,
  putUserMetaConditional,
} from '../../../src/lib/plugins/sdk.js';
```

- [ ] **Step 2: Run the SDK tests and verify they fail**

Run:

```bash
cd server && node --test tests/lib/plugins/sdk-user-meta.test.js
```

Expected: FAIL because `getUserMetaWithVersion` and `putUserMetaConditional` are not exported.

- [ ] **Step 3: Implement SDK helpers**

Add the exact helpers from `Target Contracts` to `server/src/lib/plugins/sdk.js`.

- [ ] **Step 4: Write failing secret-event tests**

Create `server/tests/lib/plugins/secret-events.test.js`:

```js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { emitSecret, onSecret, handlerCount, _reset } from '../../../src/lib/plugins/secret-events.js';

describe('targeted plugin secret events', () => {
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
});
```

- [ ] **Step 5: Implement secret events**

Create `server/src/lib/plugins/secret-events.js` using the `Target Contracts` code. Include:

```js
export function handlerCount(event, targetPluginId) {
  return (handlers.get(`${event}\0${targetPluginId}`) || []).length;
}

export function _reset() {
  handlers.clear();
}
```

- [ ] **Step 6: Register manifest-declared secret handlers**

In `server/src/lib/plugins/registry.js`, add `secretUnsubs` to entries and register handlers only from the plugin module selected by the manifest:

```js
import { onSecret, emitSecret } from './secret-events.js';

function subscribeSecretEvents(id, plugin, manifest) {
  const subs = [];
  const events = manifest.extensionPoints?.secretEvents || [];
  const handlers = plugin?.secretEvents || {};
  for (const entry of events) {
    const eventName = entry.event;
    const fn = handlers[eventName];
    if (typeof fn !== 'function') continue;
    const wrapped = (payload) => {
      const registryEntry = state.entries.get(id);
      if (!registryEntry?.enabled) return;
      return fn(payload, buildContext(id, registryEntry.settings));
    };
    subs.push(onSecret(eventName, id, wrapped));
  }
  return subs;
}
```

Add to `buildContext`:

```js
emitSecretTo: (targetPluginId, event, payload) => hookEmitSecret(event, targetPluginId, payload),
```

Use the actual imported name:

```js
import { onSecret, emitSecret as hookEmitSecret } from './secret-events.js';
```

- [ ] **Step 7: Validate manifest and capability vocabulary**

Add to `server/src/lib/plugins/manifest.js`:

```js
if (ep.secretEvents !== undefined) {
  if (!Array.isArray(ep.secretEvents)) {
    errors.push('extensionPoints.secretEvents must be an array');
  } else {
    for (const item of ep.secretEvents) {
      if (!item || typeof item !== 'object') {
        errors.push('secretEvents entries must be objects');
      } else if (typeof item.event !== 'string' || !item.event.includes('.')) {
        errors.push('secretEvents entries require dotted event');
      }
    }
  }
}
```

Add to `server/src/lib/plugins/capabilities.js`:

```js
/^secretEvent\.receive\.[a-z][a-z0-9-]*\.[a-zA-Z][a-zA-Z0-9.:-]*$/,
```

And in `requiredCapabilities`:

```js
if (Array.isArray(ep.secretEvents)) {
  for (const item of ep.secretEvents) required.add(`secretEvent.receive.${item.event}`);
}
```

- [ ] **Step 8: Bump and document Plugin API**

Change `server/src/lib/plugins/version.js`:

```js
export const PLUGIN_API_VERSION = '1.3.0';
```

Update schema/docs/types so `learnerCompletionAfter` and `secretEvents` are present in every public contract.

- [ ] **Step 9: Run targeted core tests**

Run:

```bash
cd server && node --test \
  tests/lib/plugins/sdk-user-meta.test.js \
  tests/lib/plugins/secret-events.test.js \
  tests/lib/plugins/manifest.test.js \
  tests/lib/plugins/capabilities.test.js \
  tests/routes/me.test.js
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/lib/plugins server/src/routes/me.js server/tests/lib/plugins docs/plugins packages/plugin-sdk/index.d.ts
git commit -m "feat: add targeted plugin secret events"
```

## Task 3: Implement OpenRouter State Machine Tests and Pure Helpers

**Files:**
- Create: `plugins/openrouter-rewards/server/state.js`
- Create: `plugins/openrouter-rewards/server/state.test.js`
- Create: `plugins/openrouter-rewards/server/rules.js`
- Create: `plugins/openrouter-rewards/server/rules.test.js`

- [ ] **Step 1: Write pending-claim and duplicate-mount tests**

Create `plugins/openrouter-rewards/server/state.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState,
  claimFingerprint,
  createPendingClaim,
  existingPendingResponse,
  reserveAward,
  clearReservation,
  finalizeAwardReservation,
} from './state.js';

describe('OpenRouter reward state machine', () => {
  it('returns an existing pending claim before evaluating new rules', () => {
    const state = {
      ...emptyState(),
      pendingClaim: {
        ruleIds: ['rule-1'],
        reservationIds: ['res-1'],
        accumulatedAmount: 5,
        qualifiedAt: '2026-05-05T12:00:00.000Z',
        claimFingerprint: 'sha256:abc',
      },
    };

    assert.deepEqual(existingPendingResponse(state), {
      status: 'pending-oauth',
      accumulatedAmount: 5,
      ruleIds: ['rule-1'],
    });
  });

  it('does not clear a reservation after an external side effect succeeds', () => {
    const state = reserveAward(emptyState(), [{ id: 'rule-1', creditAmount: 5 }], {
      amount: 5,
      targetLimit: 5,
      reservationId: 'res-1',
      createdAt: '2026-05-05T12:00:00.000Z',
    });

    assert.throws(
      () => clearReservation(state, 'res-1', { externalSucceeded: true }),
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
```

- [ ] **Step 2: Run the state tests and verify they fail**

Run:

```bash
cd server && node --test ../plugins/openrouter-rewards/server/state.test.js
```

Expected: FAIL because the files do not exist yet.

- [ ] **Step 3: Implement state helpers**

Create `plugins/openrouter-rewards/server/state.js`:

```js
import { createHash } from 'node:crypto';

export function emptyState() {
  return {
    openrouterUserId: null,
    keyHash: null,
    activeKeyPolicy: null,
    lifetimeAwarded: 0,
    firedRuleIds: [],
    pendingClaim: null,
    pendingReissue: null,
    reservations: [],
    oauthSessions: [],
    deliveryAttempts: [],
  };
}

export function claimFingerprint(pendingClaim) {
  const stable = JSON.stringify({
    ruleIds: [...(pendingClaim?.ruleIds || [])].sort(),
    amount: pendingClaim?.accumulatedAmount || 0,
  });
  return `sha256:${createHash('sha256').update(stable).digest('hex')}`;
}

export function existingPendingResponse(state) {
  if (!state?.pendingClaim) return null;
  return {
    status: 'pending-oauth',
    accumulatedAmount: state.pendingClaim.accumulatedAmount,
    ruleIds: state.pendingClaim.ruleIds || [],
  };
}

export function createPendingClaim(rules, amount, qualifiedAt) {
  const pending = {
    ruleIds: rules.map((rule) => rule.id),
    reservationIds: [],
    accumulatedAmount: amount,
    qualifiedAt,
  };
  pending.claimFingerprint = claimFingerprint(pending);
  return pending;
}

export function reserveAward(state, rules, { amount, targetLimit, reservationId, createdAt }) {
  const ruleIds = rules.map((rule) => rule.id);
  const reservation = {
    id: reservationId,
    kind: 'award',
    phase: 'reserved',
    ruleIds,
    amount,
    targetLimit,
    createdAt,
  };
  const pendingClaim = state.openrouterUserId ? state.pendingClaim : createPendingClaim(rules, amount, createdAt);
  return {
    ...state,
    pendingClaim: pendingClaim
      ? { ...pendingClaim, reservationIds: [...(pendingClaim.reservationIds || []), reservationId] }
      : null,
    reservations: [...(state.reservations || []), reservation],
  };
}

export function clearReservation(state, reservationId, { externalSucceeded = false } = {}) {
  if (externalSucceeded) throw new Error('must not clear reservation after external side effect succeeds');
  return {
    ...state,
    reservations: (state.reservations || []).filter((item) => item.id !== reservationId),
  };
}

export function finalizeAwardReservation(state, reservationId, { keyHash, awardedAt }) {
  const reservation = (state.reservations || []).find((item) => item.id === reservationId);
  if (!reservation) return state;
  const fired = new Set([...(state.firedRuleIds || []), ...reservation.ruleIds]);
  const pendingClaim = state.pendingClaim
    ? {
        ...state.pendingClaim,
        ruleIds: state.pendingClaim.ruleIds.filter((id) => !reservation.ruleIds.includes(id)),
        reservationIds: state.pendingClaim.reservationIds.filter((id) => id !== reservationId),
      }
    : null;
  return {
    ...state,
    keyHash,
    lifetimeAwarded: (state.lifetimeAwarded || 0) + reservation.amount,
    firedRuleIds: [...fired],
    pendingClaim: pendingClaim && pendingClaim.ruleIds.length ? pendingClaim : null,
    reservations: (state.reservations || []).filter((item) => item.id !== reservationId),
    lastAwardedAt: awardedAt,
  };
}
```

- [ ] **Step 4: Write rules tests**

Create `plugins/openrouter-rewards/server/rules.test.js` with tests for:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRules, validateSharedPolicy } from './rules.js';

describe('OpenRouter reward rules', () => {
  it('does not match fired, pending, or reserved rule IDs', () => {
    const state = {
      firedRuleIds: ['fired'],
      pendingClaim: { ruleIds: ['pending'] },
      reservations: [{ ruleIds: ['reserved'] }],
    };
    const rules = ['fired', 'pending', 'reserved', 'fresh'].map((id) => ({
      id,
      enabled: true,
      trigger: 'lesson-count',
      value: 1,
    }));
    assert.deepEqual(evaluateRules(rules, state, [{ lessonId: 'l1' }], 'l1').map((r) => r.id), ['fresh']);
  });

  it('rejects incompatible key policies', () => {
    assert.throws(
      () => validateSharedPolicy([
        { enabled: true, limitReset: 'monthly', expiresAfterDays: null },
        { enabled: true, limitReset: 'weekly', expiresAfterDays: null },
      ]),
      /same reset cadence/
    );
  });
});
```

- [ ] **Step 5: Implement rules**

Create `plugins/openrouter-rewards/server/rules.js` with:

```js
export function evaluateRules(rules, state, completions, justCompletedLessonId) {
  const firedOrPending = new Set([
    ...(state.firedRuleIds ?? []),
    ...(state.pendingClaim?.ruleIds ?? []),
    ...((state.reservations ?? []).flatMap((r) => r.ruleIds ?? [])),
  ]);

  return rules.filter((rule) => {
    if (!rule.enabled) return false;
    if (firedOrPending.has(rule.id)) return false;
    if (rule.trigger === 'lesson-count') return completions.length >= rule.value;
    if (rule.trigger === 'specific-lesson') {
      return rule.value === justCompletedLessonId || completions.some((c) => c.lessonId === rule.value);
    }
    return false;
  });
}

export function validateSharedPolicy(rules) {
  const enabled = rules.filter((rule) => rule.enabled);
  if (enabled.length <= 1) return;
  const first = enabled[0];
  for (const rule of enabled.slice(1)) {
    if (rule.limitReset !== first.limitReset || rule.expiresAfterDays !== first.expiresAfterDays) {
      throw new Error('All OpenRouter reward rules must use the same reset cadence and expiry in this version.');
    }
  }
}
```

- [ ] **Step 6: Run pure tests**

Run:

```bash
cd server && node --test \
  ../plugins/openrouter-rewards/server/state.test.js \
  ../plugins/openrouter-rewards/server/rules.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/openrouter-rewards/server/state.js plugins/openrouter-rewards/server/state.test.js plugins/openrouter-rewards/server/rules.js plugins/openrouter-rewards/server/rules.test.js
git commit -m "feat: add OpenRouter reward state machine"
```

## Task 4: Add OAuth State Binding

**Files:**
- Create: `plugins/openrouter-rewards/server/oauth-state.js`
- Create: `plugins/openrouter-rewards/server/oauth-state.test.js`
- Modify: `plugins/openrouter-rewards/server/index.js`
- Modify: `plugins/openrouter-rewards/client/LearnerHomeBanner.jsx`
- Modify: `plugins/openrouter-rewards/client/LearnerCompletionAfter.jsx`

- [ ] **Step 1: Write OAuth state tests**

Create `plugins/openrouter-rewards/server/oauth-state.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOauthSession,
  consumeOauthSession,
  pkceChallengeForVerifier,
} from './oauth-state.js';

describe('OpenRouter OAuth state binding', () => {
  it('binds state to the pending claim fingerprint and PKCE challenge', () => {
    const verifier = 'a'.repeat(64);
    const codeChallenge = pkceChallengeForVerifier(verifier);
    const state = {
      pendingClaim: { claimFingerprint: 'sha256:claim-a' },
      oauthSessions: [],
    };

    const { nextState, state: rawState } = buildOauthSession(state, {
      codeChallenge,
      now: new Date('2026-05-05T12:00:00.000Z'),
    });

    const consumed = consumeOauthSession(nextState, {
      state: rawState,
      codeVerifier: verifier,
      now: new Date('2026-05-05T12:01:00.000Z'),
    });

    assert.equal(consumed.session.claimFingerprint, 'sha256:claim-a');
    assert.equal(consumed.nextState.oauthSessions.length, 0);
  });

  it('rejects callback state for a different pending claim', () => {
    const verifier = 'b'.repeat(64);
    const first = buildOauthSession({
      pendingClaim: { claimFingerprint: 'sha256:claim-a' },
      oauthSessions: [],
    }, {
      codeChallenge: pkceChallengeForVerifier(verifier),
      now: new Date('2026-05-05T12:00:00.000Z'),
    });

    const tampered = {
      ...first.nextState,
      pendingClaim: { claimFingerprint: 'sha256:claim-b' },
    };

    assert.throws(
      () => consumeOauthSession(tampered, {
        state: first.state,
        codeVerifier: verifier,
        now: new Date('2026-05-05T12:01:00.000Z'),
      }),
      /pending claim changed/
    );
  });
});
```

- [ ] **Step 2: Implement OAuth state helper**

Create `plugins/openrouter-rewards/server/oauth-state.js`:

```js
import { createHash, randomBytes } from 'node:crypto';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function pkceChallengeForVerifier(verifier) {
  return base64url(createHash('sha256').update(verifier).digest());
}

export function buildOauthSession(state, { codeChallenge, now = new Date() }) {
  if (!state.pendingClaim?.claimFingerprint) throw new Error('pending claim required');
  if (!codeChallenge || typeof codeChallenge !== 'string') throw new Error('codeChallenge required');
  const rawState = randomBytes(32).toString('base64url');
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const session = {
    stateHash: sha256(rawState),
    codeChallenge,
    claimFingerprint: state.pendingClaim.claimFingerprint,
    createdAt,
    expiresAt,
  };
  return {
    state: rawState,
    nextState: {
      ...state,
      oauthSessions: [...(state.oauthSessions || []).filter((s) => new Date(s.expiresAt) > now).slice(-2), session],
    },
  };
}

export function consumeOauthSession(state, { state: rawState, codeVerifier, now = new Date() }) {
  const stateHash = sha256(rawState || '');
  const idx = (state.oauthSessions || []).findIndex((session) => session.stateHash === stateHash);
  if (idx < 0) throw new Error('OAuth state not found');
  const session = state.oauthSessions[idx];
  if (new Date(session.expiresAt) <= now) throw new Error('OAuth state expired');
  if (session.codeChallenge !== pkceChallengeForVerifier(codeVerifier || '')) throw new Error('PKCE verifier mismatch');
  if (session.claimFingerprint !== state.pendingClaim?.claimFingerprint) throw new Error('pending claim changed');
  return {
    session,
    nextState: {
      ...state,
      oauthSessions: state.oauthSessions.filter((_, i) => i !== idx),
    },
  };
}
```

- [ ] **Step 3: Add route contracts**

In `plugins/openrouter-rewards/server/index.js`, add:

```js
routes.post('/oauth/start', authenticate, async (c) => {
  const user = c.get('user');
  const { codeChallenge } = await c.req.json();
  const latest = await getUserMetaWithVersion(user.userId, PLUGIN_ID);
  const state = latest.data || emptyState();
  const { state: oauthState, nextState } = buildOauthSession(state, { codeChallenge });
  await putUserMetaConditional(user.userId, PLUGIN_ID, nextState, latest.version);
  return c.json({
    state: oauthState,
    authorizationUrl: buildAuthorizationUrl({ state: oauthState, codeChallenge }),
  });
});
```

Require `/claim` to receive `{ code, state, codeVerifier }` and call `consumeOauthSession` before `exchangeOAuthCode`.

- [ ] **Step 4: Update client flow**

In `LearnerCompletionAfter.jsx`, replace direct URL construction with:

```js
const verifier = createPkceVerifier();
const codeChallenge = await createPkceChallenge(verifier);
const res = await authenticatedFetch('/v1/plugins/openrouter-rewards/oauth/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ codeChallenge }),
});
const data = await res.json();
sessionStorage.setItem(`or-pkce-verifier:${data.state}`, verifier);
window.location.assign(data.authorizationUrl);
```

In `LearnerHomeBanner.jsx`, require both `code` and `state`, then read:

```js
const verifier = sessionStorage.getItem(`or-pkce-verifier:${state}`);
sessionStorage.removeItem(`or-pkce-verifier:${state}`);
```

Submit `{ code, state, codeVerifier: verifier }` to `/claim`.

- [ ] **Step 5: Run OAuth tests**

Run:

```bash
cd server && node --test ../plugins/openrouter-rewards/server/oauth-state.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/openrouter-rewards/server/oauth-state.js plugins/openrouter-rewards/server/oauth-state.test.js plugins/openrouter-rewards/server/index.js plugins/openrouter-rewards/client
git commit -m "feat: bind OpenRouter OAuth claims to state"
```

## Task 5: Implement Idempotent Award, Top-Up, and Reissue Routes

**Files:**
- Modify: `plugins/openrouter-rewards/server/index.js`
- Modify: `plugins/openrouter-rewards/server/openrouter-client.js`
- Modify: `plugins/openrouter-rewards/server/state.js`
- Test: `plugins/openrouter-rewards/server/index.test.js`
- Test: `plugins/openrouter-rewards/server/openrouter-client.test.js`

- [ ] **Step 1: Write route tests for duplicate mounts**

In `plugins/openrouter-rewards/server/index.test.js`, add:

```js
it('returns pending-oauth for repeated completion mounts with an existing pending claim', async () => {
  seedUserMeta('usr_user', {
    ...emptyState(),
    pendingClaim: {
      ruleIds: ['rule-1'],
      reservationIds: ['res-1'],
      accumulatedAmount: 5,
      qualifiedAt: '2026-05-05T12:00:00.000Z',
      claimFingerprint: 'sha256:claim',
    },
  });

  const res = await userReq(app, 'POST', '/check-pending', { lessonId: 'lesson-a' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    status: 'pending-oauth',
    accumulatedAmount: 5,
    ruleIds: ['rule-1'],
  });
  assert.equal(openrouter.calls.length, 0);
});
```

- [ ] **Step 2: Write top-up idempotency tests**

Add:

```js
it('patches top-up to an absolute target limit', async () => {
  seedUserMeta('usr_user', {
    ...emptyState(),
    openrouterUserId: 'user_or',
    keyHash: 'hash_1',
    firedRuleIds: [],
  });
  openrouter.getKey = async () => ({ hash: 'hash_1', limit: 10, usage: 1, limit_remaining: 9 });
  openrouter.patchKey = async (hash, body) => {
    openrouter.calls.push({ hash, body });
    return { hash, limit: body.limit };
  };

  const res = await userReq(app, 'POST', '/check-pending', { lessonId: 'lesson-a' });
  assert.equal(res.status, 200);
  assert.equal(openrouter.calls[0].body.limit, 15);
});
```

- [ ] **Step 3: Write finalization-failure test**

Add:

```js
it('does not clear a reservation after OpenRouter creates a key but finalization conflicts', async () => {
  forceNextMetaWriteConflictAfterExternalSuccess();
  const res = await userReq(app, 'POST', '/claim', {
    code: 'code',
    state: validState,
    codeVerifier: validVerifier,
  });

  assert.equal(res.status, 409);
  const state = await readUserMeta('usr_user');
  assert.equal(state.reservations[0].phase, 'external-succeeded');
  assert.equal(state.reservations[0].external.keyHash, 'hash_created');
});
```

- [ ] **Step 4: Implement `check-pending` order**

In `POST /check-pending`, use this order:

```js
const latest = await getUserMetaWithVersion(userId, PLUGIN_ID);
const state = latest.data || emptyState();
const existing = existingPendingResponse(state);
if (existing) return c.json(existing);
if ((state.reservations || []).some((r) => r.kind === 'award')) {
  return c.json({ status: 'processing' }, 202);
}
```

Only after those checks should the route list completions and evaluate rules.

- [ ] **Step 5: Implement external side-effect phases**

Use this structure for award execution:

```js
let externalSucceeded = false;
try {
  const reservedState = reserveAward(state, matched, award);
  await putUserMetaConditional(userId, PLUGIN_ID, reservedState, latest.version);

  const result = await mutateOpenRouter(reservedState, award);
  externalSucceeded = true;

  await finalizeWithRetry(userId, reservationId, result);
  return c.json(successResponse(result));
} catch (err) {
  if (!externalSucceeded) {
    const retry = await getUserMetaWithVersion(userId, PLUGIN_ID);
    await putUserMetaConditional(userId, PLUGIN_ID, clearReservation(retry.data, reservationId), retry.version);
  }
  throw err;
}
```

For minted/reissued keys, if bounded finalization retries fail after OpenRouter success:

```js
await openrouter.disableKey(created.hash);
logger.error('openrouter_created_key_compensated', { keyHash: created.hash, reservationId });
return c.json({ error: 'Reward delivery could not be finalized. Please retry.' }, 503);
```

If disabling also fails, log:

```js
logger.error('openrouter_orphan_key_created', { keyHash: created.hash, reservationId });
```

Do not return plaintext unless final state is persisted.

- [ ] **Step 6: Implement reissue reservation**

Before creating a replacement key, write:

```js
reissueReservation: {
  id: crypto.randomUUID(),
  oldKeyHash: state.keyHash,
  remainingCredit,
  phase: 'reserved',
  createdAt: now,
}
```

Finalize by setting `keyHash` to the new hash, clearing `pendingReissue`, clearing `reissueReservation`, and only then deleting/disabling the old key.

- [ ] **Step 7: Run route tests**

Run:

```bash
cd server && node --test \
  ../plugins/openrouter-rewards/server/index.test.js \
  ../plugins/openrouter-rewards/server/openrouter-client.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add plugins/openrouter-rewards/server
git commit -m "feat: make OpenRouter rewards idempotent"
```

## Task 6: Replace Slack Open-Bus Delivery With Secret Handler

**Files:**
- Create: `plugins/slack/server/openrouter-delivery.js`
- Create: `plugins/slack/server/openrouter-delivery.test.js`
- Modify: `plugins/slack/server/index.js`
- Modify: `plugins/slack/plugin.json`
- Modify: `plugins/openrouter-rewards/server/index.js`

- [ ] **Step 1: Write Slack secret handler tests**

Create `plugins/slack/server/openrouter-delivery.test.js`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deliverOpenRouterKey } from './openrouter-delivery.js';

describe('Slack OpenRouter key delivery', () => {
  it('no-ops when slackDmAllowed is false', async () => {
    const calls = [];
    const result = await deliverOpenRouterKey({
      payload: { slackDmAllowed: false, plaintext: 'sk-or-secret' },
      settings: { botToken: 'xoxb-token' },
      slack: { sendDm: async () => calls.push('sent') },
    });

    assert.deepEqual(result, { delivered: false, reason: 'not_allowed' });
    assert.deepEqual(calls, []);
  });

  it('sends plaintext only when explicitly allowed and a Slack user resolves', async () => {
    const calls = [];
    const result = await deliverOpenRouterKey({
      payload: { slackDmAllowed: true, plaintext: 'sk-or-secret', userEmail: 'a@example.com' },
      settings: { botToken: 'xoxb-token' },
      slack: {
        findUserByEmail: async () => ({ id: 'U123' }),
        sendDm: async (userId, text) => calls.push({ userId, text }),
      },
    });

    assert.equal(result.delivered, true);
    assert.equal(calls[0].userId, 'U123');
    assert.match(calls[0].text, /sk-or-secret/);
  });
});
```

- [ ] **Step 2: Implement Slack delivery helper**

Create `plugins/slack/server/openrouter-delivery.js`:

```js
export async function deliverOpenRouterKey({ payload, settings, slack, logger = console }) {
  if (payload.slackDmAllowed !== true) return { delivered: false, reason: 'not_allowed' };
  if (!settings?.botToken) return { delivered: false, reason: 'not_configured' };

  const user = await slack.findUserByEmail(payload.userEmail);
  if (!user?.id) return { delivered: false, reason: 'user_not_found' };

  try {
    await slack.sendDm(user.id, [
      'Your OpenRouter key from plato:',
      '',
      payload.plaintext,
      '',
      'Slack may retain this message according to your workspace retention policy.',
    ].join('\n'));
    return { delivered: true };
  } catch (err) {
    logger.error?.('slack_openrouter_key_delivery_failed', { error: err.message });
    return { delivered: false, reason: 'send_failed' };
  }
}
```

- [ ] **Step 3: Export secret handler from Slack**

In `plugins/slack/server/index.js`, export:

```js
import { deliverOpenRouterKey } from './openrouter-delivery.js';

export default {
  routes,
  secretEvents: {
    async 'openrouter-rewards.keyAwarded'(payload, ctx) {
      return deliverOpenRouterKey({
        payload,
        settings: ctx.settings,
        slack: createSlackDeliveryClient(ctx.settings.botToken),
        logger: ctx.logger,
      });
    },
  },
};
```

- [ ] **Step 4: Declare Slack secret capability**

In `plugins/slack/plugin.json`, add:

```json
"secretEvent.receive.openrouter-rewards.keyAwarded"
```

And:

```json
"secretEvents": [
  { "event": "openrouter-rewards.keyAwarded" }
]
```

- [ ] **Step 5: Emit targeted secret event from OpenRouter**

In `plugins/openrouter-rewards/server/index.js`, after final state persists and only when Slack delivery is enabled:

```js
await emitSecretTo('slack', 'openrouter-rewards.keyAwarded', {
  userId,
  userEmail: user.email,
  plaintext: minted.plaintext,
  keyHash: minted.hash,
  slackDmAllowed: settings.delivery?.slackDmEnabled === true,
});
```

Do not call the open `emit()` with plaintext.

- [ ] **Step 6: Run Slack and secret event tests**

Run:

```bash
cd server && node --test \
  tests/lib/plugins/secret-events.test.js \
  ../plugins/slack/server/openrouter-delivery.test.js \
  tests/routes/slack-plugin.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/slack plugins/openrouter-rewards/server/index.js server/src/lib/plugins server/tests/lib/plugins
git commit -m "feat: deliver OpenRouter keys through targeted Slack handler"
```

## Task 7: Add Client Slot UX for Pending Claims, OAuth Callback, and Reissue

**Files:**
- Create: `plugins/openrouter-rewards/client/index.js`
- Create: `plugins/openrouter-rewards/client/LearnerCompletionAfter.jsx`
- Create: `plugins/openrouter-rewards/client/LearnerHomeBanner.jsx`
- Create: `plugins/openrouter-rewards/client/LearnerProfileFields.jsx`
- Create: `plugins/openrouter-rewards/client/AdminSettingsPanel.jsx`
- Create: `plugins/openrouter-rewards/client/AdminProfileFields.jsx`
- Modify: `client/src/pages/LessonChat.jsx`
- Modify: `client/src/pages/LessonsList.jsx`
- Modify: `client/src/pages/Settings.jsx`
- Test: `client/src/lib/plugins` or manual smoke, because this repo has no React component test harness yet.

- [ ] **Step 1: Render new learner slots**

Add:

```jsx
<PluginSlot name="learnerCompletionAfter" context={{ lessonId, lessonKB }} />
```

Only render it when the `achieved` transition is true or when `lessonKB.status === 'completed'` and the completion panel is visible.

Add:

```jsx
<PluginSlot name="learnerHomeBanner" />
```

near the top of `LessonsList.jsx`.

Add:

```jsx
<PluginSlot name="learnerProfileFields" context={{ profile }} />
```

inside `Settings.jsx`.

- [ ] **Step 2: Implement completion component**

`LearnerCompletionAfter.jsx` must:

```js
// POST /check-pending once per completed lessonId in this mount.
// no-claim: render null.
// processing: render "Reward is being prepared." with retry.
// pending-oauth: render Claim CTA that calls /oauth/start.
// minted: reveal plaintext once and never persist it.
// topped-up: render non-secret confirmation.
```

- [ ] **Step 3: Implement callback component**

`LearnerHomeBanner.jsx` must:

```js
const params = new URLSearchParams(window.location.search);
const code = params.get('code');
const state = params.get('state');
if (!code || !state) return null;
const verifier = sessionStorage.getItem(`or-pkce-verifier:${state}`);
sessionStorage.removeItem(`or-pkce-verifier:${state}`);
if (!verifier) showRecoverableError('OpenRouter sign-in expired. Claim again.');
```

Then call `/claim` with `{ code, state, codeVerifier: verifier }` and remove `code`/`state` from the URL with `history.replaceState`.

- [ ] **Step 4: Run client build**

Run:

```bash
cd client && npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages plugins/openrouter-rewards/client packages/plugin-sdk/index.d.ts docs/plugins
git commit -m "feat: add OpenRouter rewards learner UI"
```

## Task 8: Add Manifest, Settings Preservation, Backfill, Admin Controls, and API Spike Notes

**Files:**
- Create: `plugins/openrouter-rewards/plugin.json`
- Modify: `server/src/lib/plugins/registry.js`
- Test: `server/tests/routes/plugins-admin.test.js`
- Test: `plugins/openrouter-rewards/server/index.test.js`
- Modify: `plugins/openrouter-rewards/client/AdminSettingsPanel.jsx`
- Modify: `plugins/openrouter-rewards/client/AdminProfileFields.jsx`

- [ ] **Step 1: Add write-only settings preservation tests**

In `server/tests/routes/plugins-admin.test.js`, add:

```js
it('preserves omitted writeOnly settings when saving visible settings', async () => {
  const existing = makeEntry({
    id: 'openrouter-rewards',
    settings: { managementKey: 'sk-management', workspaceId: 'ws_old' },
    schema: {
      type: 'object',
      properties: {
        managementKey: { type: 'string', writeOnly: true },
        workspaceId: { type: 'string' },
      },
    },
  });
  pluginRegistry.updateSettings = async (id, next) => {
    assert.deepEqual(next, { workspaceId: 'ws_new' });
    return makeEntry({ id, settings: { managementKey: 'sk-management', workspaceId: 'ws_new' }, schema: existing.manifest.settingsSchema });
  };
});
```

Also add registry-level tests that call the real `pluginRegistry.updateSettings` with existing activation state and verify:

```text
omitted writeOnly -> preserved
new writeOnly string -> replaced
empty string -> cleared
sanitized response -> hidden
```

- [ ] **Step 2: Implement registry preservation**

In `pluginRegistry.updateSettings`, merge write-only properties before writing:

```js
const props = entry.manifest?.settingsSchema?.properties || {};
const currentSettings = record[id]?.settings || entry.settings || {};
const merged = { ...nextSettings };
for (const [key, schema] of Object.entries(props)) {
  if (schema?.writeOnly && !(key in nextSettings)) {
    merged[key] = currentSettings[key];
  }
}
record[id] = { ...(record[id] || {}), enabled: entry.enabled, settings: merged };
entry.settings = merged;
```

- [ ] **Step 3: Create manifest**

Create `plugins/openrouter-rewards/plugin.json` with:

```json
{
  "$schema": "../../docs/plugins/plugin.schema.json",
  "id": "openrouter-rewards",
  "name": "OpenRouter Rewards",
  "version": "0.1.0",
  "apiVersion": "^1.3.0",
  "description": "Issue OpenRouter API keys as configurable lesson-completion rewards.",
  "author": "plato core",
  "license": "AGPL-3.0-or-later",
  "capabilities": [
    "server.routes",
    "settings.read",
    "settings.write",
    "user.metadata.read",
    "user.metadata.write",
    "ui.slot.adminSettingsPanel",
    "ui.slot.adminProfileFields",
    "ui.slot.learnerProfileFields",
    "ui.slot.learnerCompletionAfter",
    "ui.slot.learnerHomeBanner"
  ],
  "extensionPoints": {
    "serverRoutes": "server/index.js#default",
    "slots": {
      "adminSettingsPanel": "client/AdminSettingsPanel.jsx",
      "adminProfileFields": "client/AdminProfileFields.jsx",
      "learnerProfileFields": "client/LearnerProfileFields.jsx",
      "learnerCompletionAfter": "client/LearnerCompletionAfter.jsx",
      "learnerHomeBanner": "client/LearnerHomeBanner.jsx"
    }
  },
  "settingsSchema": {
    "type": "object",
    "properties": {
      "managementKey": { "type": "string", "writeOnly": true, "description": "OpenRouter management/provisioning key." },
      "workspaceId": { "type": "string", "description": "OpenRouter workspace ID or slug for the classroom." },
      "reissueCooldownHours": { "type": "number", "default": 24 },
      "keyNameTemplate": { "type": "string", "default": "plato:{classroomName}:{userEmail}" },
      "delivery": {
        "type": "object",
        "properties": {
          "inAppReveal": { "type": "boolean", "default": true },
          "slackDmEnabled": { "type": "boolean", "default": false }
        }
      }
    }
  }
}
```

- [ ] **Step 4: Add API spike output section to spec**

After the real OpenRouter spike, append exact response evidence to the spec. Replace the example values below with the status codes and conclusions observed in the spike before committing:

```markdown
## Phase 0 API Spike Results

Date: 2026-05-05
Management key scope: management key used for classroom workspace API spike
Learner account membership before test: learner account was not already an organization member

| Call | Status | Result | Decision |
|---|---:|---|---|
| POST /api/v1/auth/keys | observed status | observed OAuth exchange body shape | keep or revise OAuth exchange implementation |
| POST /api/v1/workspaces/{id}/members/add | observed status | observed membership behavior | keep workspace-member design or redesign |
| POST /api/v1/keys with workspace_id + creator_user_id | observed status | observed key-creation behavior | keep learner-owned workspace key design or redesign |
| PATCH /api/v1/keys/:hash limit increase | observed status | observed top-up behavior | keep in-place top-up or use replacement-key degraded mode |
```

- [ ] **Step 5: Run plugin validation and server tests**

Run:

```bash
node scripts/validate-plugins.js
cd server && node --test tests/routes/plugins-admin.test.js ../plugins/openrouter-rewards/server/index.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/openrouter-rewards/plugin.json plugins/openrouter-rewards/client plugins/openrouter-rewards/server server/src/lib/plugins/registry.js server/tests/routes/plugins-admin.test.js docs/superpowers/specs/2026-05-05-openrouter-rewards-plugin-design.md
git commit -m "feat: add OpenRouter rewards plugin shell"
```

## Task 9: End-to-End Verification and Closeout

**Files:**
- Read/verify only unless fixing failures.

- [ ] **Step 1: Run server tests**

Run:

```bash
cd server && npm test
```

Expected: PASS.

- [ ] **Step 2: Run client build**

Run:

```bash
cd client && npm run build
```

Expected: PASS.

- [ ] **Step 3: Run plugin validator**

Run:

```bash
node scripts/validate-plugins.js
```

Expected: PASS.

- [ ] **Step 4: Run docs whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit 0.

- [ ] **Step 5: Manual smoke with real OpenRouter API**

Use a non-production classroom workspace and a learner account that is not already an OpenRouter organization member:

```text
1. Enable OpenRouter Rewards in /plato/plugins.
2. Save management key and workspace ID.
3. Click Test connection.
4. Configure lesson-count: 1, creditAmount: 1, monthly reset.
5. Complete one lesson as a learner.
6. Click Claim and complete OpenRouter OAuth.
7. Confirm /claim returns plaintext once.
8. Confirm refresh does not reveal plaintext again.
9. Use the key against https://openrouter.ai/api/v1/chat/completions.
10. Complete another qualifying rule and confirm top-up does not rotate the key when PATCH supports limit increases.
11. Enable Slack delivery and confirm the DM arrives only when Slack is enabled and the user email resolves.
12. Reissue from Settings and verify cooldown.
13. Queue reissue as admin and verify learner can claim despite cooldown.
```

- [ ] **Step 6: Final security grep**

Run:

```bash
rg -n "plaintext|keyAwarded|emit\\(|on\\(" plugins/openrouter-rewards plugins/slack server/src/lib/plugins
```

Expected:

```text
No open hook bus emit/on call carries plaintext OpenRouter keys.
Plaintext appears only in HTTP responses, in-memory modal state, and targeted Slack secret handler payloads.
```

- [ ] **Step 7: Commit any verification fixes**

```bash
git add plugins/openrouter-rewards plugins/slack server/src/lib/plugins server/src/routes/me.js server/tests docs/plugins packages/plugin-sdk/index.d.ts client/src/pages
git commit -m "fix: close OpenRouter rewards verification gaps"
```

## Self-Review Checklist

- [ ] The OAuth callback cannot bind a learner to an attacker-controlled OpenRouter identity because `state`, `codeChallenge`, current user metadata, and pending claim fingerprint must all match.
- [ ] Repeated `learnerCompletionAfter` mounts return `pending-oauth`, `processing`, `minted`, or `topped-up`; they do not hide existing claims as `no-claim`.
- [ ] OpenRouter top-ups are absolute-limit writes, so retrying the same reservation does not double credit.
- [ ] OpenRouter key plaintext is never emitted on the open hook bus.
- [ ] Slack plaintext delivery requires an enabled Slack plugin, a manifest-declared secret handler, admin opt-in, a bot token, and a resolvable Slack user.
- [ ] No path stores plaintext OpenRouter keys at rest in Plato.
- [ ] No route changes lesson completion semantics or adds exchange-count cutoffs.
- [ ] Plugin API docs, schema, SDK types, capabilities, and version are updated together.
- [ ] All tests and manual smoke steps above pass before merging.
