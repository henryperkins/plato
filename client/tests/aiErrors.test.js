/**
 * Contextual copy for failed AI calls (client/src/lib/aiErrors.js): each
 * message names who failed, why, and what to do next, and never shows the
 * raw server validation text that used to reach learners.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../js/api.js';
import { aiErrorKind, aiErrorMessage } from '../src/lib/aiErrors.js';

const serverError = (code, status) => new ApiError('api', 'raw server text', status, code);

describe('aiErrorMessage', () => {
  it('tells learners the coach is unavailable without technical detail', () => {
    assert.equal(
      aiErrorMessage(serverError('ai_unavailable'), 'coach-reply'),
      "Your coach can't reply because the AI service is unavailable right now. Try again later, and tell your program admin if this keeps happening. Your message is back in the box.",
    );
  });

  it('gives admins the configuration hint they can act on', () => {
    assert.equal(
      aiErrorMessage(serverError('ai_unavailable'), 'lesson-creator'),
      "The lesson creator can't respond because the server can't reach the AI service. Check the server's AWS credentials and Bedrock model access.",
    );
  });

  it('replaces the empty-content validation text with a next step', () => {
    const message = aiErrorMessage(serverError('empty_message', 400), 'coach-reply');
    assert.doesNotMatch(message, /non-empty content|raw server text/);
    assert.equal(message, "Your coach couldn't reply because the AI service couldn't process the request. If you attached an image or link, try sending without it. Your message is back in the box.");
  });

  it('words retries for the surface the learner is on', () => {
    assert.equal(
      aiErrorMessage(serverError('ai_rate_limited', 429), 'coach-start'),
      "Your coach couldn't start this lesson because the AI service is busy. Wait a moment, then reload the page to try again.",
    );
    assert.equal(aiErrorMessage(serverError('ai_timeout'), 'kb-editor'), 'The knowledge base editor took too long to respond. Try again.');
  });

  it('covers client-side failures', () => {
    assert.equal(
      aiErrorMessage(new ApiError('empty_response', 'The AI returned an empty reply.'), 'coach-reply'),
      'Your coach sent an empty reply. Try again. Your message is back in the box.',
    );
    assert.equal(
      aiErrorMessage(new ApiError('parse', 'Failed to parse agent JSON response.'), 'lesson-builder'),
      "plato couldn't build the lesson from this conversation because the AI's response couldn't be read. Try again.",
    );
    assert.equal(
      aiErrorMessage(new ApiError('api', 'Internal server error. This may be a temporary issue.', 500), 'preview'),
      "plato couldn't build the preview because of a server problem. Try again.",
    );
  });

  it('explains connection and session problems', () => {
    assert.equal(
      aiErrorMessage(new TypeError('Failed to fetch'), 'profile-feedback'),
      "plato couldn't update your profile because your device can't reach the server. Check your internet connection, then try again. Your feedback is still in the box.",
    );
    assert.equal(aiErrorMessage(new Error('Session expired'), 'coach-reply'), 'Your session expired. Sign in again to continue.');
  });

  it('keeps messages from non-AI errors, which app code already words for people', () => {
    assert.equal(
      aiErrorMessage(new Error('Lesson "Intro" already exists'), 'kb-builder'),
      'Lesson "Intro" already exists.',
    );
    assert.equal(
      aiErrorMessage(new Error('Image is larger than 5 MB'), 'coach-reply'),
      'Image is larger than 5 MB. Your message is back in the box.',
    );
  });

  it('falls back to a generic subject for unknown surfaces', () => {
    assert.equal(aiErrorMessage(serverError('ai_error'), 'somewhere-new'), "The AI assistant couldn't respond because of a server problem. Try again.");
  });
});

describe('aiErrorKind', () => {
  it('prefers the server code over the transport status', () => {
    assert.equal(aiErrorKind(new ApiError('api', 'x', 500, 'ai_unavailable')), 'unavailable');
    assert.equal(aiErrorKind(new ApiError('api', 'x', 500)), 'server');
  });

  it('does not mistake programming errors for network failures', () => {
    assert.equal(aiErrorKind(new TypeError("Cannot read properties of undefined (reading 'map')")), 'other');
  });
});
