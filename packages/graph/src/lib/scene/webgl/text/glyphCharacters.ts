/**
 * Whether a UTF-16 code unit is one that no line draws a glyph for: a space, or whitespace that a text without
 * wrapping draws as one (`layoutText`). Any other character of a text can draw one.
 */
export function isLineSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 12 || code === 13;
}

/** Whether the code units at `index` and after it are a surrogate pair. */
export function isSurrogatePair(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  if (code < 0xd800 || code >= 0xdc00 || index + 1 >= text.length) return false;
  const next = text.charCodeAt(index + 1);
  return next >= 0xdc00 && next < 0xe000;
}

/**
 * Whether `text` holds a surrogate pair. Its lines can draw a pair whole at one size and as two lone halves at another
 * (`glyphCapacity`), so lines that place every unit still leave glyphs unpacked: such a text always prefills.
 */
export function hasSurrogatePair(text: string): boolean {
  for (let index = 0; index + 1 < text.length; index++) {
    if (isSurrogatePair(text, index)) return true;
  }
  return false;
}

/**
 * The glyph instances a camera-aware text keeps whatever its line breaks (`encodeText`): one per UTF-16 code unit that
 * can draw a glyph (every one but a space and the whitespace an unwrapped line draws as one), and one for the
 * ellipsis. A surrogate pair takes two: the layout splits a word too wide for its box at UTF-16 offsets, as v1 did, so
 * a pair can draw as two lone halves. Its lines never place more: they hold its characters (some maybe dropped, a pair
 * whole or in halves) and at most one "…".
 */
export function glyphCapacity(text: string): number {
  let count = 1;
  for (let index = 0; index < text.length; index++) {
    if (!isLineSpace(text.charCodeAt(index))) count++;
  }
  return count;
}
