import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationText } from '../src/lib/lessonCreationEngine.js';

// buildConversationText feeds the lesson-extractor agent. It is shared by the
// lesson editor's "Create/Update Lesson" finalize path and the preview-refresh
// path, so both must produce the exact same text.

describe('buildConversationText', () => {
  it('returns an empty string for no messages', () => {
    assert.equal(buildConversationText([]), '');
  });

  it('tolerates a nullish argument', () => {
    assert.equal(buildConversationText(undefined), '');
    assert.equal(buildConversationText(null), '');
  });

  it('labels a user message with "User:"', () => {
    assert.equal(
      buildConversationText([{ role: 'user', content: 'hello' }]),
      'User: hello'
    );
  });

  it('joins user and assistant turns with a blank line', () => {
    const out = buildConversationText([
      { role: 'user', content: 'teach git' },
      { role: 'assistant', content: 'What is the outcome?' },
    ]);
    assert.equal(out, 'User: teach git\n\nAgent: What is the outcome?');
  });

  it('maps any non-user role to "Agent:"', () => {
    assert.equal(
      buildConversationText([{ role: 'assistant', content: 'hi' }]),
      'Agent: hi'
    );
  });
});
