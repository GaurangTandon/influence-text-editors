/**
 * The parts of the demo that need no editor library.
 *
 * Deliberately free of imports so that three very different realms can all use
 * one copy of it:
 *
 *   - the top document, which mounts the editors,
 *   - a same-origin iframe, which runs its own copy of the bundle and ends up
 *     either hosting the editor or hosting the code that edits it,
 *   - an extension's content script, which is bundled separately and must not
 *     drag five editors along with it.
 *
 * `rangeForOffsets` in particular has to be shared: it is the offset -> DOM point
 * walk, and an influence that computes the wrong range is worse than one that
 * computes nothing, because an editor will happily apply it.
 */

/** The pre-existing content every editor starts with. */
export const SENTENCE = "The quick brown fox jumps over the lazy dog.";
export const CONTENT_HTML = "The <strong>quick</strong> brown fox jumps over the <em>lazy</em> dog.";
/** The word every demo aims at. */
export const WORD = "quick";

/** `NodeFilter.SHOW_TEXT`, read off the target's own window when we can get it. */
const SHOW_TEXT = 4;

/**
 * DOM Range covering `start`..`end` as character offsets into `el`'s text.
 *
 * A TreeWalker over SHOW_TEXT is the only portable way to map character offsets
 * onto DOM points: inline formatting splits one sentence across several text
 * nodes, so child indices are useless.
 *
 * Everything is taken from `el.ownerDocument` rather than the ambient
 * `document`, because `el` is regularly *not* in the document this code was
 * loaded into — it lives in an iframe or in another realm — and an ambient
 * `createTreeWalker` would then walk nothing at all.
 *
 * @param {HTMLElement} el contenteditable root
 * @param {number} start
 * @param {number} end
 * @param {Window} [scope] window to take constants and constructors from
 * @returns {Range}
 */
export function rangeForOffsets(el, start, end, scope) {
  const doc = el.ownerDocument;
  const view = scope ?? doc.defaultView ?? globalThis;
  const showText = typeof view.NodeFilter === "function" ? view.NodeFilter.SHOW_TEXT : SHOW_TEXT;
  const walker = doc.createTreeWalker(el, showText);
  let startPoint = null;
  let endPoint = null;
  let offset = 0;
  let node;
  while ((node = walker.nextNode())) {
    const next = offset + node.data.length;
    if (startPoint === null && next > start) {
      startPoint = [node, start - offset];
    }
    if (next >= end) {
      endPoint = [node, end - offset];
      break;
    }
    offset = next;
  }
  if (!startPoint || !endPoint) {
    throw new Error(`cannot map offsets ${start}..${end} onto ${el.className || el.tagName}`);
  }
  const range = doc.createRange();
  range.setStart(startPoint[0], startPoint[1]);
  range.setEnd(endPoint[0], endPoint[1]);
  return range;
}