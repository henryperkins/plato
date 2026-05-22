import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function source(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assertIncludes(text, expected, label = expected) {
  assert.ok(text.includes(expected), `Expected source to include ${label}`);
}

describe('mobile input and chat polish source contracts', () => {
  it('keeps shared text primitives at 16px on mobile with compact desktop text', () => {
    const input = source('src/components/ui/input.jsx');
    const textarea = source('src/components/ui/textarea.jsx');

    assertIncludes(input, 'text-base');
    assertIncludes(input, 'md:text-sm');
    assertIncludes(input, 'h-10');
    assertIncludes(textarea, 'text-base');
    assertIncludes(textarea, 'md:text-sm');
    assertIncludes(textarea, 'focus-visible:ring-3');
  });

  it('uses row-based compose resizing and mobile-safe text/touch targets', () => {
    const compose = source('src/components/chat/ComposeBar.jsx');

    assertIncludes(compose, 'COMPOSER_MAX_ROWS = 8');
    assertIncludes(compose, 'useAutoResize({ maxRows: COMPOSER_MAX_ROWS })');
    assertIncludes(compose, 'text-base leading-6');
    assertIncludes(compose, 'md:text-sm md:leading-5');
    assertIncludes(compose, 'chat-composer-safe');
    assert.ok(
      (compose.match(/size-10 md:size-7/g) || []).length >= 2,
      'attach and send buttons should be at least 40px on mobile'
    );
    assertIncludes(compose, 'size-10 rounded-full md:size-6');
    assertIncludes(compose, "role=\"status\"");
    assertIncludes(compose, "aria-live=\"polite\"");
    assertIncludes(compose, "e.key === 'Enter' && (e.metaKey || e.ctrlKey)");
  });

  it('keeps chat accessibility semantics while adding shared log and bubble classes', () => {
    const chatArea = source('src/components/chat/ChatArea.jsx');
    const userMessage = source('src/components/chat/UserMessage.jsx');
    const assistantMessage = source('src/components/chat/AssistantMessage.jsx');

    assertIncludes(chatArea, 'useChatKeyboardNav(logRef)');
    assertIncludes(chatArea, 'chat-log');
    assertIncludes(chatArea, 'role="log"');
    assertIncludes(chatArea, 'aria-live="off"');
    assertIncludes(chatArea, 'aria-label="Chat log"');

    assertIncludes(userMessage, 'data-chat-message="user"');
    assertIncludes(userMessage, 'You said:');
    assertIncludes(userMessage, 'chat-bubble');
    assert.doesNotMatch(userMessage, /max-w-\[85%\]/);

    assertIncludes(assistantMessage, 'data-chat-message="assistant"');
    assertIncludes(assistantMessage, 'Coach says:');
    assertIncludes(assistantMessage, 'chat-bubble');
    assertIncludes(assistantMessage, 'aria-hidden={streaming || undefined}');
    assert.doesNotMatch(assistantMessage, /max-w-\[85%\]/);
  });

  it('applies learner safe-area fixed composer and document scroll padding', () => {
    const lessonChat = source('src/pages/LessonChat.jsx');
    const css = source('src/index.css');

    assertIncludes(lessonChat, "document.getElementById('main-content')");
    assertIncludes(lessonChat, 'fixedComposeRef');
    assertIncludes(lessonChat, 'ResizeObserver');
    assertIncludes(lessonChat, "style.setProperty('--composer-height'");
    assertIncludes(lessonChat, 'style.scrollPaddingBottom');
    assertIncludes(lessonChat, "classList.add('lesson-chat-scroll-padding')");
    assertIncludes(lessonChat, 'fixed-compose-safe');
    assert.doesNotMatch(lessonChat, /bottom-9/);
    assertIncludes(lessonChat, 'chat-bubble');
    assert.doesNotMatch(lessonChat, /max-w-\[85%\]/);

    assertIncludes(css, '--safe-top: env(safe-area-inset-top, 0px);');
    assertIncludes(css, '--safe-bottom: env(safe-area-inset-bottom, 0px);');
    assertIncludes(css, '--app-footer-height:');
    assertIncludes(css, '--composer-height:');
    assertIncludes(css, '--bubble-max:');
    assertIncludes(css, '.chat-composer-safe');
    assertIncludes(css, '.fixed-compose-safe');
    assertIncludes(css, 'bottom: var(--app-footer-height);');
    assertIncludes(css, '.chat-log');
    assertIncludes(css, '.chat-bubble');
    assertIncludes(css, '.lesson-chat-scroll-padding');
    assertIncludes(css, '-webkit-tap-highlight-color: transparent;');
  });
});
