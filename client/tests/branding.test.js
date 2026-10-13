import test from 'node:test';
import assert from 'node:assert/strict';
import { contrastText, luminance } from '../src/lib/branding.js';

test('derived branding text meets normal-text contrast for configurable colors', () => {
  for (let red = 0; red <= 255; red += 17) {
    for (let green = 0; green <= 255; green += 17) {
      for (let blue = 0; blue <= 255; blue += 17) {
        const background = '#' + [red, green, blue].map(c => c.toString(16).padStart(2, '0')).join('');
        const bg = luminance(background);
        const fg = luminance(contrastText(background));
        const ratio = (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
        assert.ok(ratio >= 4.5, `${background} uses ${contrastText(background)} at ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test('default brand and very light backgrounds preserve their foregrounds', () => {
  assert.equal(contrastText('#470d99'), '#ffffff');
  assert.equal(contrastText('#ffffff'), '#1a1a1a');
});
