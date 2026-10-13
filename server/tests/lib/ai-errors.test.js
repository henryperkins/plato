import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAiError } from '../../src/lib/ai-errors.js';

function awsError(name, httpStatusCode, message = `${name} message`) {
  const err = new Error(message);
  err.name = name;
  if (httpStatusCode) err.$metadata = { httpStatusCode };
  return err;
}

describe('classifyAiError', () => {
  it('treats missing credentials and denied model access as unavailable', () => {
    assert.equal(classifyAiError(awsError('CredentialsProviderError')).code, 'ai_unavailable');
    assert.equal(classifyAiError(awsError('AccessDeniedException', 403)).code, 'ai_unavailable');
    assert.equal(classifyAiError(awsError('ResourceNotFoundException', 404)).code, 'ai_unavailable');
  });

  it('never echoes the provider message, which can carry account details', () => {
    const err = awsError('AccessDeniedException', 403,
      'User: arn:aws:sts::123456789012:assumed-role/plato-api/fn is not authorized to perform: bedrock:InvokeModel');
    const { message } = classifyAiError(err);
    assert.equal(message, 'The AI service is unavailable.');
    assert.doesNotMatch(message, /arn:|123456789012/);
  });

  it('separates rate limits, overload, and timeouts', () => {
    assert.equal(classifyAiError(awsError('ThrottlingException', 429)).code, 'ai_rate_limited');
    assert.equal(classifyAiError(awsError('ServiceUnavailableException', 503)).code, 'ai_overloaded');
    assert.equal(classifyAiError(awsError('ModelNotReadyException')).code, 'ai_overloaded');
    assert.equal(classifyAiError(awsError('ModelTimeoutException', 408)).code, 'ai_timeout');
    assert.equal(classifyAiError(new Error('Bedrock stream timed out after 115000ms')).code, 'ai_timeout');
  });

  it('flags requests the provider rejected as invalid', () => {
    assert.equal(classifyAiError(awsError('ValidationException', 400)).code, 'ai_invalid_request');
  });

  it('treats unreachable endpoints as unavailable', () => {
    const err = new Error('getaddrinfo ENOTFOUND bedrock-runtime.us-east-2.amazonaws.com');
    err.code = 'ENOTFOUND';
    assert.equal(classifyAiError(err).code, 'ai_unavailable');
  });

  it('falls back to a generic code for anything else', () => {
    assert.deepEqual(classifyAiError(new Error('boom')), { code: 'ai_error', message: 'The AI service failed to respond.' });
    assert.equal(classifyAiError(undefined).code, 'ai_error');
  });
});
