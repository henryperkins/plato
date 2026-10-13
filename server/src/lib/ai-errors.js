/**
 * Classify an AI provider failure into a stable code for the browser.
 *
 * The client maps the code, plus the surface that made the call, to
 * contextual copy (client/src/lib/aiErrors.js). The raw provider message never
 * leaves the server: an AWS AccessDenied message can include the account ID
 * and IAM role name. Server logs keep the full error.
 */

const MESSAGES = {
  ai_unavailable: 'The AI service is unavailable.',
  ai_rate_limited: 'The AI service is rate limiting requests.',
  ai_overloaded: 'The AI service is temporarily overloaded.',
  ai_timeout: 'The AI service did not respond in time.',
  ai_invalid_request: 'The AI service could not process the request.',
  ai_error: 'The AI service failed to respond.',
};

// Missing or rejected credentials, no model access, or an unknown model ID.
// None of these clear up on retry; an operator has to fix configuration.
const UNAVAILABLE = new Set([
  'CredentialsProviderError',
  'AccessDeniedException',
  'UnrecognizedClientException',
  'InvalidSignatureException',
  'ExpiredTokenException',
  'ResourceNotFoundException',
]);

const RATE_LIMITED = new Set(['ThrottlingException', 'ServiceQuotaExceededException']);
const OVERLOADED = new Set(['ServiceUnavailableException', 'ModelNotReadyException', 'InternalServerException']);
const TIMEOUT = new Set(['ModelTimeoutException', 'TimeoutError', 'AbortError']);
const NETWORK = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT']);

/** @returns {{ code: string, message: string }} */
export function classifyAiError(err) {
  const name = err?.name || '';
  const status = err?.$metadata?.httpStatusCode;
  let code = 'ai_error';

  if (UNAVAILABLE.has(name) || status === 401 || status === 403) code = 'ai_unavailable';
  else if (RATE_LIMITED.has(name) || status === 429) code = 'ai_rate_limited';
  // Before the generic 5xx check: a model timeout can arrive as a 408 or 5xx.
  else if (TIMEOUT.has(name) || /timed out/i.test(String(err?.message || ''))) code = 'ai_timeout';
  else if (name === 'ValidationException' || status === 400) code = 'ai_invalid_request';
  else if (OVERLOADED.has(name) || status >= 500) code = 'ai_overloaded';
  else if (NETWORK.has(err?.code)) code = 'ai_unavailable';

  return { code, message: MESSAGES[code] };
}
