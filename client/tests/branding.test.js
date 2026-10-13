import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildThemeVars, contrastRatio, contrastText, hexToOklch, luminance, normalizeHex, readableColor } from '../src/lib/branding.js';

describe('classroom color contrast', () => {
  it('keeps brand colors while selecting readable text for midtone backgrounds', () => {
    assert.equal(contrastText('#8b1a1a'), '#ffffff');
    assert.equal(contrastText('#ffffff'), '#1a1a1a');
    assert.ok(contrastRatio(contrastText('#999999'), '#999999') >= 4.5);
  });

  it('covers the gap between white and near-black across grayscale and colored palettes', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#470d99'];
    for (let value = 0; value <= 255; value++) colors.push('#' + value.toString(16).padStart(2, '0').repeat(3));
    for (const color of colors) {
      assert.ok(contrastRatio(contrastText(color), color) >= 4.5, color);
    }
  });

  it('preserves readable accents and adjusts failing light and dark text colors', () => {
    assert.equal(readableColor('#470d99', '#f5f5f5'), '#470d99');
    for (const background of ['#f5f5f5', '#303030']) {
      for (const color of ['#ffffff', '#000000', '#999999', '#ffff00', '#8b1a1a', '#dc2626']) {
        assert.ok(contrastRatio(readableColor(color, background), background) >= 4.6, `${color} on ${background}`);
      }
    }
  });

  it('separates original surfaces from accessible link and focus roles in both themes', () => {
    const vars = buildThemeVars({ primary: '#ffffff', accent: '#999999' });
    assert.equal(vars['--classroom-header-bg'], '#ffffff');
    assert.equal(vars['--primary'], hexToOklch('#ffffff'));
    assert.notEqual(vars['--classroom-link-light'], vars['--primary']);
    assert.notEqual(vars['--classroom-link-dark'], vars['--classroom-link-light']);
    assert.equal(vars['--classroom-ring-light'], vars['--classroom-link-light']);
  });

  it('ignores malformed theme values and falls back to primary when accent is absent', () => {
    assert.deepEqual(buildThemeVars(null), {});
    assert.deepEqual(buildThemeVars({ primary: 'invalid', accent: '#xyzxyz' }), {});
    assert.equal(buildThemeVars({ primary: '#8b1a1a' })['--classroom-link-light'], hexToOklch('#8b1a1a'));
  });

  it('normalizes shorthand and non-six-digit theme colors instead of dropping them', () => {
    assert.equal(normalizeHex('#fff'), '#ffffff');
    assert.equal(normalizeHex('#FFF'), '#ffffff');
    assert.equal(normalizeHex('#f008'), '#ff0000');
    assert.equal(normalizeHex('#ff000080'), '#ff0000');
    assert.equal(normalizeHex('ff0000'), '#ff0000');
    assert.equal(normalizeHex('rgb(255, 0, 0)'), '#ff0000');
    assert.equal(normalizeHex('rgba(255, 0, 0, 0.5)'), '#ff0000');
    assert.equal(normalizeHex('  #8b1a1a  '), '#8b1a1a');
    assert.equal(normalizeHex('invalid'), null);
    assert.equal(normalizeHex('#xyzxyz'), null);
    assert.equal(normalizeHex(null), null);
    // Regression for issue 1: shorthand primary used to yield {}.
    assert.deepEqual(buildThemeVars({ primary: '#fff' }), buildThemeVars({ primary: '#ffffff' }));
    assert.equal(buildThemeVars({ primary: '#fff' })['--classroom-header-bg'], '#ffffff');
    assert.ok(contrastRatio(contrastText('#fff'), '#ffffff') >= 4.5);
    assert.equal(hexToOklch('#fff'), hexToOklch('#ffffff'));
    assert.equal(readableColor('#fff', '#ffffff'), readableColor('#ffffff', '#ffffff'));
  });

  it('exposes --ring for consumers that apply vars without .classroom-theme', () => {
    const vars = buildThemeVars({ primary: '#470d99', accent: '#dc2626' });
    assert.equal(vars['--ring'], vars['--classroom-ring-light']);
    assert.ok(vars['--ring']);
  });
});

it('derived branding text meets normal-text contrast for configurable colors', () => {
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

it('default brand and very light backgrounds preserve their foregrounds', () => {
  assert.equal(contrastText('#470d99'), '#ffffff');
  assert.equal(contrastText('#ffffff'), '#1a1a1a');
});
