// Cell-text normalization for MOPS HTML tables.
// MOPS pads cells with &nbsp; (U+00A0), uses commas as thousands separators,
// and writes several distinct "no value" markers.
// Note: JS regex \s already matches U+00A0, so cleaning relies on \s rather than
// matching the non-breaking space literally.

// A cell equal to one of these (after cleaning) means "no value".
// NOTE: only a *bare* dash is a null marker; "-1.60" is a real negative number.
const NULL_MARKERS = new Set(['', '-', '不適用']);

/** Collapse whitespace runs (incl. &nbsp;) to single spaces and trim. */
export function cleanCell(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function isNullMarker(text: string): boolean {
  return NULL_MARKERS.has(text.trim());
}

/** Remove thousands separators and all whitespace, leaving a bare numeric string. */
function stripNumeric(text: string): string {
  return text.replace(/[\s,]/g, '');
}

/** Parse a salary/count field (仟元 or headcount) to an integer, or null. */
export function parseIntK(text: string): number | null {
  const cleaned = cleanCell(text);
  if (isNullMarker(cleaned)) return null;
  const bare = stripNumeric(cleaned);
  if (isNullMarker(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Parse a float field (EPS etc.), preserving sign, or null. */
export function parseFloatSafe(text: string): number | null {
  const cleaned = cleanCell(text);
  if (isNullMarker(cleaned)) return null;
  const bare = stripNumeric(cleaned);
  if (isNullMarker(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? n : null;
}

/** Parse a percentage like "20.08%" to the number 20.08, or null. */
export function parsePercent(text: string): number | null {
  const cleaned = cleanCell(text);
  if (isNullMarker(cleaned)) return null;
  const bare = stripNumeric(cleaned).replace(/%/g, '');
  if (isNullMarker(bare)) return null;
  const n = Number(bare);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a MOPS boolean flag. The encoding changed over the years, so this handles
 * both conventions (verified across 108-114): years 108-109 use 'V' = true and a
 * blank cell = false; years 110+ use 'Y' = true / 'N' = false. A blank/null marker
 * always means "flag not set" = false. Anything unexpected returns null (a signal).
 */
export function parseFlag(text: string): boolean | null {
  const cleaned = cleanCell(text).toUpperCase();
  if (cleaned === 'Y' || cleaned === 'V') return true;
  if (cleaned === 'N') return false;
  if (isNullMarker(cleaned)) return false;
  return null;
}

/** Parse a free-text field (note/improvement): cleaned text, or null when empty/marker. */
export function parseText(text: string): string | null {
  const cleaned = cleanCell(text);
  return isNullMarker(cleaned) ? null : cleaned;
}

/** ROC (民國) year to Common Era year: rocToCe(114) === 2025. */
export function rocToCe(rocYear: number): number {
  return rocYear + 1911;
}

/** Common Era year to ROC (民國) year: ceToRoc(2025) === 114. */
export function ceToRoc(ceYear: number): number {
  return ceYear - 1911;
}
