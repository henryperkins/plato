import { useCallback } from 'react';

function numericStyle(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRowBasedMaxHeight(el, maxRows) {
  if (!maxRows) return null;
  const styles = globalThis.getComputedStyle?.(el);
  if (!styles) return null;
  const fontSize = numericStyle(styles.fontSize) || 16;
  const lineHeight = numericStyle(styles.lineHeight) || fontSize * 1.5;
  const padding = numericStyle(styles.paddingTop) + numericStyle(styles.paddingBottom);
  return Math.ceil((lineHeight * maxRows) + padding);
}

export function useAutoResize(options = 200) {
  const maxHeight = typeof options === 'number' ? options : options?.maxHeight;
  const maxRows = typeof options === 'number' ? null : options?.maxRows;

  return useCallback((e) => {
    const el = e.target;
    const limit = getRowBasedMaxHeight(el, maxRows) ?? maxHeight ?? 200;
    el.style.overflowY = 'hidden';
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, limit);
    el.style.height = newHeight + 'px';
    el.style.overflowY = newHeight >= limit ? 'auto' : 'hidden';
  }, [maxHeight, maxRows]);
}
