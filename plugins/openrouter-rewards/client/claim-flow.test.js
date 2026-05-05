import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { completeOpenRouterClaimFromUrl, startOpenRouterClaim } from './claim-flow.js';

describe('OpenRouter claim flow', () => {
  it('starts OAuth, stores the verifier by state, and navigates to OpenRouter', async () => {
    const stored = new Map();
    let assigned = null;

    const result = await startOpenRouterClaim({
      createVerifier: () => 'verifier-1',
      createChallenge: async (verifier) => `challenge-for-${verifier}`,
      storage: { setItem: (key, value) => stored.set(key, value) },
      getCallbackUrl: () => 'http://localhost:5173/settings',
      assign: (url) => { assigned = url; },
      fetcher: async (url, opts) => {
        assert.equal(url, '/v1/plugins/openrouter-rewards/oauth/start');
        assert.equal(opts.method, 'POST');
        assert.deepEqual(JSON.parse(opts.body), {
          codeChallenge: 'challenge-for-verifier-1',
          callbackUrl: 'http://localhost:5173/settings',
        });
        return {
          ok: true,
          json: async () => ({ state: 'state-1', authorizationUrl: 'https://openrouter.ai/auth?state=state-1' }),
        };
      },
    });

    assert.equal(stored.get('or-pkce-verifier:state-1'), 'verifier-1');
    assert.equal(assigned, 'https://openrouter.ai/auth?state=state-1');
    assert.equal(result.state, 'state-1');
  });

  it('surfaces server errors without storing a verifier', async () => {
    const stored = new Map();

    await assert.rejects(() => startOpenRouterClaim({
      createVerifier: () => 'verifier-1',
      createChallenge: async () => 'challenge-1',
      storage: { setItem: (key, value) => stored.set(key, value) },
      getCallbackUrl: () => 'http://localhost:5173/settings',
      assign: () => {},
      fetcher: async () => ({
        ok: false,
        json: async () => ({ error: 'pending claim required' }),
      }),
    }), /pending claim required/);

    assert.equal(stored.size, 0);
  });

  it('completes an OAuth callback from the current URL', async () => {
    const removed = [];
    let replaced = null;

    const result = await completeOpenRouterClaimFromUrl({
      href: 'http://localhost:5173/settings?code=auth-code&state=state-1&tab=profile#openrouter',
      storage: {
        getItem: (key) => key === 'or-pkce-verifier:state-1' ? 'verifier-1' : null,
        removeItem: (key) => removed.push(key),
      },
      replaceState: (_state, _title, url) => { replaced = url; },
      fetcher: async (url, opts) => {
        assert.equal(url, '/v1/plugins/openrouter-rewards/claim');
        assert.equal(opts.method, 'POST');
        assert.deepEqual(JSON.parse(opts.body), {
          code: 'auth-code',
          state: 'state-1',
          codeVerifier: 'verifier-1',
        });
        return {
          ok: true,
          json: async () => ({ status: 'minted', plaintext: 'sk-or-v1-key' }),
        };
      },
    });

    assert.deepEqual(result, { type: 'success', plaintext: 'sk-or-v1-key', data: { status: 'minted', plaintext: 'sk-or-v1-key' } });
    assert.deepEqual(removed, ['or-pkce-verifier:state-1']);
    assert.equal(replaced, '/settings?tab=profile#openrouter');
  });

  it('returns null when the URL has no OAuth callback params', async () => {
    const result = await completeOpenRouterClaimFromUrl({
      href: 'http://localhost:5173/settings',
      storage: { getItem: () => null, removeItem: () => {} },
      replaceState: () => { throw new Error('should not replace'); },
      fetcher: async () => { throw new Error('should not fetch'); },
    });

    assert.equal(result, null);
  });

  it('reports expired callbacks without calling the server', async () => {
    const result = await completeOpenRouterClaimFromUrl({
      href: 'http://localhost:5173/settings?code=auth-code&state=state-1',
      storage: { getItem: () => null, removeItem: () => {} },
      replaceState: () => {},
      fetcher: async () => { throw new Error('should not fetch'); },
    });

    assert.deepEqual(result, { type: 'error', text: 'OpenRouter sign-in expired. Claim again.' });
  });
});
