import { authenticatedFetch } from '../../../client/js/auth.js';
import { createPkceChallenge, createPkceVerifier } from './pkce.js';

let inFlightCallback = null;

export async function startOpenRouterClaim({
  createVerifier = createPkceVerifier,
  createChallenge = createPkceChallenge,
  fetcher = authenticatedFetch,
  storage = globalThis.sessionStorage,
  getCallbackUrl = () => globalThis.window.location.href,
  assign = (url) => globalThis.window.location.assign(url),
} = {}) {
  const verifier = createVerifier();
  const codeChallenge = await createChallenge(verifier);
  const res = await fetcher('/v1/plugins/openrouter-rewards/oauth/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codeChallenge, callbackUrl: getCallbackUrl() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not start OpenRouter sign-in');
  storage.setItem(`or-pkce-verifier:${data.state}`, verifier);
  assign(data.authorizationUrl);
  return data;
}

export async function completeOpenRouterClaimFromUrl({
  href = globalThis.window.location.href,
  storage = globalThis.sessionStorage,
  replaceState = (state, title, url) => globalThis.history.replaceState(state, title, url),
  fetcher = authenticatedFetch,
} = {}) {
  const url = new URL(href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return inFlightCallback;

  const verifierKey = `or-pkce-verifier:${state}`;
  const verifier = storage.getItem(verifierKey);
  storage.removeItem(verifierKey);

  url.searchParams.delete('code');
  url.searchParams.delete('state');
  replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  if (!verifier) {
    return { type: 'error', text: 'OpenRouter sign-in expired. Claim again.' };
  }

  inFlightCallback = (async () => {
    try {
      const res = await fetcher('/v1/plugins/openrouter-rewards/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state, codeVerifier: verifier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'OpenRouter claim failed');
      return { type: 'success', plaintext: data.plaintext, data };
    } catch (err) {
      return { type: 'error', text: err.message };
    } finally {
      inFlightCallback = null;
    }
  })();

  return inFlightCallback;
}

export function _resetOpenRouterClaimCallbackForTests() {
  inFlightCallback = null;
}
