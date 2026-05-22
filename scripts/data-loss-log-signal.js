const SYNC_WRITE_CODE = 'unhandled_error';

export function isDataLossEntry(entry) {
  if (!entry || entry.code !== SYNC_WRITE_CODE) return false;
  const m = entry.meta || {};
  const method = String(m.method || '').toUpperCase();
  return (method === 'PUT' || method === 'POST') && String(m.path || '').startsWith('/v1/sync');
}

function entrySources(entry) {
  if (Array.isArray(entry.sources)) return entry.sources;
  if (entry.source) return String(entry.source).split('+').filter(Boolean);
  return [];
}

function groupEntries(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const m = entry.meta || {};
    const method = String(m.method || '').toUpperCase();
    const path = String(m.path || '');
    const key = `${method} ${path}`;
    const ts = entry.ts || entry.timestamp || '';
    const sources = entrySources(entry);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        code: SYNC_WRITE_CODE,
        level: entry.level || 'error',
        count: 1,
        firstSeen: ts,
        lastSeen: ts,
        sources: [...sources],
        sample: entry,
      });
      continue;
    }
    existing.count++;
    if (ts && (!existing.firstSeen || ts < existing.firstSeen)) existing.firstSeen = ts;
    if (ts && (!existing.lastSeen || ts > existing.lastSeen)) {
      existing.lastSeen = ts;
      existing.sample = entry;
    }
    for (const source of sources) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen));
}

function groupSamples(group) {
  const samples = [];
  if (group?.sample) samples.push({ ...group.sample, code: group.sample.code || group.code });
  if (Array.isArray(group?.samples)) {
    for (const sample of group.samples) {
      if (sample) samples.push({ ...sample, code: sample.code || group.code });
    }
  }
  return samples;
}

/**
 * Return exact /v1/sync write-failure groups when entries are available, falling
 * back to grouped samples for older callers. Scanning entries avoids the blind
 * spot where /v1/admin/logs groups all `unhandled_error`s by code and exposes a
 * newest sample from some unrelated route.
 */
export function dataLossGroups(logs) {
  const entries = Array.isArray(logs?.entries) ? logs.entries : [];
  const entryHits = entries.filter(isDataLossEntry);
  if (entryHits.length) return groupEntries(entryHits);

  const groupHits = [];
  const groups = Array.isArray(logs?.groups) ? logs.groups : [];
  for (const group of groups) {
    const samples = groupSamples(group).filter(isDataLossEntry);
    if (!samples.length) continue;
    if (!Array.isArray(group.samples) && samples.length === 1) {
      groupHits.push({ ...group, sample: samples[0] });
    } else {
      groupHits.push(...groupEntries(samples));
    }
  }
  return groupHits;
}
