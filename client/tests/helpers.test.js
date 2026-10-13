/**
 * Tests for markdown link rendering in helpers.renderMd, focused on the
 * XSS guard (isSafeUrl): coach/markdown output is untrusted, so only safe
 * protocols may become clickable anchors. A `javascript:` URL must render
 * as literal text, never an <a href>.
 *
 * helpers.esc() uses document.createElement, so we stub a minimal `document`
 * that mirrors the browser's textContent→innerHTML escaping (escapes & < >,
 * but NOT the URL scheme — which is exactly why the protocol allowlist, not
 * escaping, is the load-bearing defense).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {
  createElement: () => ({
    set textContent(v) { this._t = v; },
    get innerHTML() {
      return String(this._t)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },
  }),
};

const { isSafeUrl, renderMd } = await import('../src/lib/helpers.js');

describe('isSafeUrl', () => {
  it('allows http(s) and mailto', () => {
    assert.equal(isSafeUrl('https://example.com'), true);
    assert.equal(isSafeUrl('http://example.com/path?q=1'), true);
    assert.equal(isSafeUrl('HTTPS://EXAMPLE.COM'), true);
    assert.equal(isSafeUrl('mailto:teacher@school.edu'), true);
  });

  it('rejects dangerous and unknown protocols', () => {
    assert.equal(isSafeUrl('javascript:alert(document.cookie)'), false);
    assert.equal(isSafeUrl('JaVaScRiPt:alert(1)'), false);
    assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeUrl('file:///etc/passwd'), false);
    assert.equal(isSafeUrl('relative/path'), false);
  });

  it('rejects leading-whitespace obfuscation', () => {
    assert.equal(isSafeUrl('  javascript:alert(1)'), false);
    // and still accepts a valid URL with stray leading space
    assert.equal(isSafeUrl(' https://example.com'), true);
  });
});

describe('renderMd lists', () => {
  it('keeps unordered items directly inside a single unordered list', () => {
    assert.equal(renderMd('- First item\n- Second item'), '<ul><li>First item</li><li>Second item</li></ul>');
  });

  it('preserves emphasis in asterisk-marked items', () => {
    assert.equal(renderMd('* *First* item\n* **Second** item'), '<ul><li><em>First</em> item</li><li><strong>Second</strong> item</li></ul>');
  });

  it('groups numbered items with either supported marker', () => {
    assert.equal(renderMd('1. First item\n2) Second item'), '<ol><li>First item</li><li>Second item</li></ol>');
  });

  it('keeps adjacent ordered and unordered lists as siblings', () => {
    assert.equal(renderMd('- First\n- Second\n1. Third\n2. Fourth'), '<ul><li>First</li><li>Second</li></ul><ol><li>Third</li><li>Fourth</li></ol>');
  });

  it('keeps surrounding prose and separate lists outside list items', () => {
    assert.equal(renderMd('Before\n- First\n\nBetween\n- Second\nAfter'), 'Before<ul><li>First</li></ul><br>Between<ul><li>Second</li></ul>After');
  });

  it('retains safe links and escaped HTML inside list items', () => {
    const html = renderMd('- [Reference](https://example.com)\n- <img src=x onerror=alert(1)>\n- [Unsafe](javascript:alert(1))');
    assert.match(html, /<li><a href="https:\/\/example\.com"[^>]*>Reference<\/a><\/li>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img|href="javascript:|<ul><ol>/);
  });
});

describe('renderMd line endings', () => {
  it('keeps CRLF-separated items in one list with no stray carriage returns', () => {
    assert.equal(renderMd('- First\r\n- Second'), '<ul><li>First</li><li>Second</li></ul>');
    assert.equal(renderMd('1. First\r\n2. Second'), '<ol><li>First</li><li>Second</li></ol>');
  });

  it('treats CR-only line endings like LF', () => {
    assert.equal(renderMd('Before\r- First\r- Second\rAfter'), 'Before<ul><li>First</li><li>Second</li></ul>After');
  });

  it('renders CRLF tables and line breaks exactly like LF', () => {
    const lf = 'Intro\n| Term | Meaning |\n|---|---|\n| KB | Knowledge base |\nOutro';
    const html = renderMd(lf.replace(/\n/g, '\r\n'));
    assert.equal(html, renderMd(lf));
    assert.match(html, /<td[^>]*>KB<\/td><td[^>]*>Knowledge base<\/td>/);
    assert.doesNotMatch(html, /\r/);
  });
});

describe('renderMd markdown links', () => {
  it('renders a safe markdown link as an anchor', () => {
    const html = renderMd('See [the docs](https://example.com/docs).');
    assert.match(html, /<a href="https:\/\/example\.com\/docs" target="_blank" rel="noopener">the docs<\/a>/);
  });

  it('does NOT render a javascript: link as an anchor', () => {
    const html = renderMd('[click here](javascript:alert(document.cookie))');
    assert.doesNotMatch(html, /<a /);
    assert.doesNotMatch(html, /href="javascript:/i);
    // The original markdown text survives (no anchor injected).
    assert.match(html, /click here/);
  });

  it('does NOT render a data: link as an anchor', () => {
    const html = renderMd('[x](data:text/html,<script>alert(1)</script>)');
    assert.doesNotMatch(html, /<a /);
  });

  it('does not double-linkify an http(s) markdown link (no nested anchors)', () => {
    const html = renderMd('See [the docs](https://example.com/docs).');
    // Exactly one anchor, and no <a> nested inside an href attribute.
    assert.equal(html.match(/<a /g).length, 1);
    assert.doesNotMatch(html, /href="<a /);
    assert.match(html, /<a href="https:\/\/example\.com\/docs" target="_blank" rel="noopener">the docs<\/a>/);
  });

  it('neutralizes attribute-breakout via quotes in an http(s) URL', () => {
    // Passes isSafeUrl (starts with https://) but tries to break out of the
    // href attribute to inject an onclick handler. esc() does not escape
    // quotes, so the link renderer must encode them.
    const html = renderMd('[click](https://evil.com" onclick="alert(document.cookie))');
    // No real attribute breakout: a raw quote must not close href and start
    // an event handler. The quotes are percent-encoded, so any "onclick" text
    // is inert URL content inside the href value, not an HTML attribute.
    assert.doesNotMatch(html, /"\s*onclick\s*=/i);
    assert.doesNotMatch(html, /href="https:\/\/evil\.com"/); // not closed early
    assert.match(html, /%22/); // quote was percent-encoded
  });

  it('still auto-linkifies a bare URL alongside a markdown link', () => {
    const html = renderMd('[docs](https://a.com) and bare https://b.com here');
    assert.equal(html.match(/<a /g).length, 2);
    assert.match(html, /<a href="https:\/\/a\.com"[^>]*>docs<\/a>/);
    assert.match(html, /<a href="https:\/\/b\.com"[^>]*>https:\/\/b\.com<\/a>/);
  });
});
