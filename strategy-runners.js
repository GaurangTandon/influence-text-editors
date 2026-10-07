/**
 * One implementation of "press a button", shared by every realm that can press it.
 *
 * The page, a same-origin iframe and an extension's content script all run their own
 * copy of this module, and each copy dispatches with the constructors of *its own*
 * realm (`apply-edit.js` derives them from `target.ownerDocument.defaultView`).
 * That is the whole point of the context measurements: the strategy code is
 * identical in all three, so any difference in the outcome is the realm's doing and
 * not the code's.
 *
 * Returns the details the outcome panel prints, rather than formatting them, so the
 * shared UI can render the same report no matter which realm produced the edit.
 */

import {
  CLIPBOARD_SUPPLY,
  attachTargetRanges,
  dispatchBeforeinput,
  dispatchDeleteKey,
  dispatchPaste,
  dispatchPasteAsBeforeinput,
  dispatchPasteWithWait,
  execInsert,
  setDomSelection,
  settleSelection,
} from "./apply-edit.js";

/** What every strategy aims to write, and what it would write as formatted text. */
export const REPLACEMENT = "sluggish";
export const REPLACEMENT_HTML = "<em>sluggish</em>";

/**
 * `getTargetRanges()` with and without the attachment, for the report.
 *
 * Built with the *editor's* window, so the probe answers the question the editor
 * itself would be asking.
 */
function targetRangeProbe(range, target) {
  const scope = target.ownerDocument.defaultView ?? globalThis;
  const make = () =>
    new scope.InputEvent("beforeinput", {
      inputType: "insertReplacementText",
      data: REPLACEMENT,
    });
  const bare = make();
  const attached = make();
  attachTargetRanges(attached, range, scope);
  return {
    before: JSON.stringify(bare.getTargetRanges()),
    after: JSON.stringify(
      attached.getTargetRanges().map((r) => ({
        container: r.startContainer.nodeName,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        collapsed: r.collapsed,
      })),
    ),
  };
}

/** The page's "yield" select: a mode name, or a number of milliseconds. */
function readSettle(value) {
  return /^[0-9]+$/.test(value) ? Number(value) : value;
}

/**
 * Run one strategy and report what was attempted.
 *
 * @param {{strategy: string, inputType?: string}} button one of BUTTONS
 * @param {{target: HTMLElement, range: Range, ui: object}} args
 *   `target` is the editor's editable root. `range` covers the word to replace. `ui`
 *   is the state of the page's controls.
 * @returns {Promise<{label: string, details: object, lines: string[]}>}
 */
export async function runStrategy(button, { target, range, ui }) {
  const html = REPLACEMENT_HTML;
  const selectionSet = String(ui.selection);

  if (button.strategy === "beforeinput") {
    const inputType = button.inputType;
    const deleting = inputType.startsWith("delete");
    const dispatched = dispatchBeforeinput({
      target,
      range,
      text: deleting ? "" : REPLACEMENT,
      html: deleting ? "" : html,
      inputType,
      selectFirst: ui.selection,
      attachRanges: ui.ranges,
      supply: ui.supply,
    });
    const event = dispatched.event;
    // Which details are worth printing depends on the inputType, because the three
    // beforeinput buttons answer three different questions: does the engine honour
    // the init dict (probe + override), what did the engine keep (ranges/method), or
    // what did the deletion do (probe only).
    const probe = inputType === "insertText" ? null : targetRangeProbe(range, target);
    const probeDetails = probe
      ? {
          "getTargetRanges() without the attachment": probe.before,
          "getTargetRanges() after the attachment": probe.after,
        }
      : {};
    return {
      label: `beforeinput ${inputType}`,
      details: {
        inputType: event.inputType,
        "supply mode": ui.supply,
        ...probeDetails,
        ...(deleting
          ? {}
          : {
              "getTargetRanges() before dispatch": String(dispatched.rangesBeforeDispatch),
              "method shadowed": String(dispatched.methodShadowed),
            }),
        "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
        "DOM selection set before dispatching": selectionSet,
      },
      lines: [`  prevented: ${event.defaultPrevented}`],
    };
  }

  if (button.strategy === "keydown") {
    const dispatched = dispatchDeleteKey({
      target,
      key: "Backspace",
      keyCode: 8,
      range,
      selectFirst: ui.selection,
    });
    const event = dispatched.event;
    return {
      label: "faked Backspace",
      details: {
        selected: JSON.stringify(range.toString()),
        "keyCode on the scripted event": String(event.keyCode),
        "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
        "DOM selection set before dispatching": selectionSet,
      },
      lines: [`  prevented: ${event.defaultPrevented}`],
    };
  }

  if (button.strategy === "paste" || button.strategy === "paste-wait") {
    const wait = button.strategy === "paste-wait";
    const dispatched = await (wait
      ? dispatchPasteWithWait({
          target,
          text: REPLACEMENT,
          html,
          range,
          selectFirst: ui.selection,
          settle: readSettle(ui.settle),
          clipboard: ui.clipboard,
        })
      : dispatchPaste({
          target,
          text: REPLACEMENT,
          html,
          range,
          selectFirst: ui.selection,
          clipboard: ui.clipboard,
        }));
    const event = dispatched.event;
    return {
      label: wait ? "synthetic paste after a yield" : "synthetic paste",
      details: {
        ...(wait ? { "yield mode": String(ui.settle), waited: `${dispatched.waitedMs.toFixed(1)} ms` } : {}),
        "clipboard supply": ui.clipboard,
        "clipboard is a real DataTransfer": String(dispatched.clipboardIsReal),
        "clipboardData text/plain": JSON.stringify(event.clipboardData?.getData("text/plain")),
        "clipboardData text/html": JSON.stringify(event.clipboardData?.getData("text/html")),
        ...(wait
          ? {}
          : { "getTargetRanges on a ClipboardEvent": String(typeof event.getTargetRanges === "function") }),
        "defaultPrevented (the editor consumed it)": String(event.defaultPrevented),
        "DOM selection set before dispatching": selectionSet,
      },
      lines: [
        `  prevented: ${event.defaultPrevented}`,
        ...(wait ? [`  waited ${dispatched.waitedMs.toFixed(1)}ms (mode ${ui.settle})`] : []),
      ],
    };
  }

  if (button.strategy === "paste-both") {
    // The two-step paste: paste-shaped beforeinput first (the shape EditContext
    // hosts answer), and a paste event as backup for the editors that only listen
    // for the ClipboardEvent shape. Both carry the real DataTransfer; the backup
    // fires only when the first event changed nothing, which is decided the same
    // way the demo decides everything else — by re-reading the text, never by
    // trusting defaultPrevented.
    const before = target.textContent;
    const selectionOk = ui.selection ? setDomSelection(target, range) : false;
    const waitedMs = await settleSelection(readSettle(ui.settle), target.ownerDocument.defaultView ?? globalThis);
    const first = dispatchPasteAsBeforeinput({ target, text: REPLACEMENT, html, range, selectFirst: false });
    // Editors apply their change on their own schedule (finding 13), so the
    // handled check waits before it reads — a backup fired too early would
    // double-edit an editor that was about to act.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const handledByBeforeinput = target.textContent !== before;
    let second = null;
    if (!handledByBeforeinput) {
      second = dispatchPaste({ target, text: REPLACEMENT, html, range, selectFirst: false, clipboard: CLIPBOARD_SUPPLY.INSTANCE });
    }
    return {
      label: "paste: beforeinput (insertFromPaste), then paste",
      details: {
        "first event": "beforeinput (insertFromPaste), real DataTransfer",
        "first event defaultPrevented": String(first.prevented),
        "handled by the first event": handledByBeforeinput ? "yes" : "no — paste dispatched as backup",
        ...(second
          ? { "backup event": "paste (ClipboardEvent), real DataTransfer", "backup defaultPrevented": String(second.prevented) }
          : {}),
        "yield mode": String(ui.settle),
        waited: `${waitedMs.toFixed(1)} ms`,
        "DOM selection set before dispatching": String(ui.selection),
      },
      lines: [
        `  beforeinput prevented: ${first.prevented}`,
        `  handled by beforeinput: ${handledByBeforeinput}`,
        ...(second ? [`  backup paste prevented: ${second.prevented}`] : []),
      ],
    };
  }

  if (button.strategy === "exec") {
    const dispatched = await execInsert({
      target,
      text: REPLACEMENT,
      html,
      range,
      selectFirst: ui.selection,
    });
    return {
      label: "execCommand",
      details: {
        "queryCommandSupported('paste')": String(target.ownerDocument.queryCommandSupported?.("paste")),
        "queryCommandEnabled('paste')": String(target.ownerDocument.queryCommandEnabled?.("paste")),
        "clipboard written (execCommand('copy'))": String(dispatched.copied),
        "command returned": String(dispatched.used.join(", ") || "(none succeeded)"),
        "paste event seen on window": String(dispatched.pasteSeen),
        "paste event defaultPrevented by the editor": String(dispatched.pastePrevented),
        "synthetic beforeinput (insertFromPaste) defaultPrevented": String(dispatched.beforeinputPrevented),
        "DOM selection set before dispatching": selectionSet,
        "waited after setting the selection": `${dispatched.settleMs} ms`,
      },
      lines: [`  commands: ${JSON.stringify(dispatched.used)}`],
    };
  }

  throw new Error(`unknown strategy "${button.strategy}"`);
}