#!/usr/bin/env node
// Cursor's `beforeSubmitPrompt` hook — the real "intercept a prompt before
// it's sent" mechanism (see the sibling equation-adventure repo's
// Markdown Files/CURSOR_EXTENSION_DESIGN_NOTES.md for the research spike
// that found it). Declared in hooks/hooks.json, this script is a plain
// Node process Cursor invokes with the prompt payload on stdin.
//
// Returns {continue:true} (informational only) by DEFAULT — a false
// heuristic block would be actively harmful to a real workflow. Above an
// OPT-IN threshold (the plugin's BLOCK_THRESHOLD_USD variable — see
// .cursor-plugin/plugin.json — 0/unset = disabled), it hard-blocks via
// confirm-gate.cjs, the same hash/resend-to-confirm pattern the sibling
// prompt-cost-preview Claude Code plugin uses for its own gate.
//
// ASSUMPTION FLAGGED, not yet confirmed live: this reads the declared
// BLOCK_THRESHOLD_USD variable from process.env.BLOCK_THRESHOLD_USD,
// following the common convention that a plugin manifest's declared
// `variables` are injected as env vars into hook commands — Cursor's own
// docs (cursor.com/docs/reference/plugins) did not spell out the exact
// injection mechanism at the time this was written. Verify this the first
// time the gate is tested against a real Cursor install with the variable
// actually set in Cursor's plugin settings; if it turns out env vars
// aren't how variables reach hook scripts, this is the one line to fix.
//
// Unlike equation-adventure's extension-cursor (which has a companion VS
// Code-style extension keeping a live ~/.aiBudgetTracker/state.json budget
// cache in sync with a signed-in Firestore account), this plugin is
// entirely standalone — there is no companion extension, no account, no
// "remaining budget." It only ever reports a per-prompt cost estimate and
// the optional block/confirm gate, never a budget-remaining figure.
//
// Every invocation appends one line to ~/.cursor-cost-preview/activity.log
// (bucket, cost, blocked/confirmed/informational, timestamp) — read by the
// hook-activity skill. Non-fatal: a log-write failure must never affect
// the gate's verdict.

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { confirmGate } = require('./confirm-gate.cjs');

const DATA_DIR = path.join(os.homedir(), '.cursor-cost-preview');

// vm.createContext only attaches FUNCTION DECLARATIONS to the context
// object — `const MODELS` is invisible as ctx.MODELS from outside the vm
// (a documented gotcha in the equation-adventure repo this was ported
// from — see CLAUDE.md's note on sessionSumCalibration()).
// estimateTask/bucketTask/etc. ARE function declarations and work fine as
// direct ctx properties; MODELS needs one extra function-declaration
// wrapper to reach.
function loadEstimator() {
  const dir = path.join(__dirname, '..', 'lib');
  const ctx = vm.createContext({ console, Math, JSON });
  for (const name of ['heuristic.js', 'token-model-core.js', 'token-model-weights.js']) {
    const full = path.join(dir, name);
    if (!fs.existsSync(full)) continue; // token-model-weights.js is optional (heuristic fallback)
    vm.runInContext(fs.readFileSync(full, 'utf8'), ctx, { filename: name });
  }
  vm.runInContext('function __exportModels(){ return MODELS; }', ctx);
  ctx.MODELS = ctx.__exportModels();
  return ctx;
}

function guessModelKey(models, rawModel) {
  const s = String(rawModel || '').toLowerCase();
  const candidates = Object.keys(models);
  const hit = candidates.find((k) => s.includes(k) || s.includes(models[k].label.toLowerCase().split(' ')[1] || '###'));
  if (hit) return hit;
  if (s.includes('gpt')) return 'gpt';
  if (s.includes('gemini')) return 'gemini-pro';
  if (s.includes('grok')) return 'grok';
  if (s.includes('haiku')) return 'haiku';
  if (s.includes('opus')) return 'opus';
  return 'sonnet';
}

function appendActivityLog(entry) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, 'activity.log'), JSON.stringify(entry) + '\n');
  } catch {
    // Non-fatal — a log-write failure must never affect the gate's verdict.
  }
}

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(input);
    } catch {
      // Malformed input: fail open, no message (never block on a parse error).
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    try {
      const g = loadEstimator();
      const modelKey = guessModelKey(g.MODELS, payload.model || payload.model_id);
      // Cursor's beforeSubmitPrompt fires for both Chat and Agent/Composer
      // sessions; the payload doesn't distinguish them, so this assumes
      // agentic:true (the more common, more expensive Cursor usage
      // pattern) — same simplification the extension-cursor version of
      // this script documents.
      const result = g.estimateTask(payload.prompt || '', modelKey, { agentic: true });
      const costMid = Math.sqrt(Math.max(result.costLow, 0.0001) * Math.max(result.costHigh, 0.0001));

      const threshold = Number(process.env.BLOCK_THRESHOLD_USD) || 0;
      const bucketLabel = (result.bucket && result.bucket.label) || result.bucket;
      const estimateLine = `cursor-cost-preview: ~$${costMid.toFixed(3)} estimated (bucket ${bucketLabel})`;

      const verdict = confirmGate({
        textToHash: payload.prompt || '',
        estimateLine,
        costMid,
        threshold,
        dataDir: DATA_DIR,
      });

      appendActivityLog({
        timestamp: new Date().toISOString(),
        bucket: bucketLabel,
        costMid,
        blocked: verdict.continue === false,
        outcome:
          verdict.continue === false ? 'blocked' : String(verdict.user_message || '').startsWith('✅ Confirmed') ? 'confirmed' : 'informational',
      });

      process.stdout.write(JSON.stringify(verdict));
    } catch (err) {
      // Any estimator failure: fail open, no message.
      process.stdout.write(JSON.stringify({ continue: true }));
    }
  });
}

main();
