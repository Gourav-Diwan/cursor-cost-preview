// Optional hard-block-above-threshold gate for before-submit-prompt.cjs.
// Ported from the sibling equation-adventure repo's extension-cursor/
// cursor-hooks/confirm-gate.cjs (itself ported from the prompt-cost-preview
// Claude Code plugin's scripts/lib/confirm-gate.cjs) — same hash/prune/
// window/three-choice-reason logic, using Cursor's actual beforeSubmitPrompt
// hook contract, {continue, user_message} (NOT Claude Code's
// {decision, reason}/{systemMessage} shape).
//
// Disabled by default — this only activates once BLOCK_THRESHOLD_USD (the
// plugin's declared variable, see .cursor-plugin/plugin.json) is set above
// 0. Established precedent across this whole product family (the sibling
// prompt-cost-preview plugin, and equation-adventure's own extension-cursor
// Cursor Hook before it) is "inform, never hard-block by default."

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIRM_WINDOW_MS = 5 * 60 * 1000;

// Reads/prunes/writes the pending-confirmation map. Never throws — a
// corrupt or unwritable state file must degrade to "no confirmations
// pending" (the next expensive prompt just re-blocks), never crash the
// hook or wedge submission.
function loadPendingConfirmations(dataDir) {
  const file = path.join(dataDir, 'pending-cost-confirmations.json');
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    map = {};
  }
  const now = Date.now();
  for (const hash of Object.keys(map)) {
    if (typeof map[hash] !== 'number' || now - map[hash] > CONFIRM_WINDOW_MS) delete map[hash];
  }
  return { file, map };
}

function savePendingConfirmations(file, map) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map));
  } catch {
    // Can't persist the confirmation — the resend will just block again
    // next time, which is the safe direction to fail in.
  }
}

// confirmGate({ textToHash, estimateLine, costMid, threshold, dataDir }) ->
// { continue, user_message } ready for JSON.stringify. Never throws.
function confirmGate({ textToHash, estimateLine, costMid, threshold, dataDir }) {
  try {
    if (dataDir && Number.isFinite(threshold) && threshold > 0 && costMid > threshold) {
      const hash = crypto.createHash('sha256').update(textToHash).digest('hex');
      const { file, map } = loadPendingConfirmations(dataDir);

      if (map[hash]) {
        // A confirmed resend within the window — single-use, so it can't
        // be replayed again after this.
        delete map[hash];
        savePendingConfirmations(file, map);
        return { continue: true, user_message: `✅ Confirmed — proceeding. ${estimateLine}` };
      }

      map[hash] = Date.now();
      savePendingConfirmations(file, map);
      return {
        continue: false,
        user_message:
          `${estimateLine} This is above your $${threshold.toFixed(2)} confirm threshold.\n\n` +
          `• Proceed — resend this exact same prompt within 5 minutes to confirm and run it as-is.\n` +
          `• Abandon — do nothing; send something else and this prompt is dropped.\n` +
          `• Edit/New — revise this prompt to a smaller scope, then send the edited version (it gets its own fresh estimate).`,
      };
    }

    return { continue: true, user_message: estimateLine };
  } catch {
    // A broken confirm-gate (e.g. unwritable state dir) must still surface
    // the estimate informationally, never block unrecoverably.
    return { continue: true, user_message: estimateLine };
  }
}

module.exports = { confirmGate };
