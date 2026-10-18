// Shared JSON salvage helpers: the model is asked for raw JSON but may add fences or prose.
// The canonical "last fenced ```json block" rule (HC-F-043) lives here.

/** The LAST fenced ```` ```json ```` block, else the last plain ``` block, else null. */
export function lastFencedBlock(raw: string): string | null {
  const jsonFences = [...raw.matchAll(/```json[^\S\n]*\n?([\s\S]*?)```/g)];
  if (jsonFences.length) {
    const m = jsonFences[jsonFences.length - 1] ?? null;
    return m ? m[1] : null;
  }
  const plainFences = [...raw.matchAll(/```[^\S\n]*\n?([\s\S]*?)```/g)];
  if (plainFences.length) {
    const m = plainFences[plainFences.length - 1] ?? null;
    return m ? m[1] : null;
  }
  return null;
}

/** Default candidate for extraction: last fenced block, else the whole text (may be pure JSON). */
export function jsonCandidate(raw: string): string {
  return lastFencedBlock(raw) ?? raw.trim();
}

/** Try hard to get a JSON value out of unknown model text. Returns null when hopeless. */
export function parseLooseJson(raw: string): unknown | null {
  const candidates = [raw.trim(), lastFencedBlock(raw) ?? '', braceCandidate(raw)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const value = JSON.parse(c);
      if (value && typeof value === 'object') return value;
    } catch {
      // next candidate
    }
  }
  return null;
}

/** First `{...}` balanced span (defensive: fenced markers inside strings confuse regexes). */
function braceCandidate(raw: string): string {
  const start = raw.indexOf('{');
  if (start < 0) return '';
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return '';
}
