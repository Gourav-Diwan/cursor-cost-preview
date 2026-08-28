#!/usr/bin/env node
// Reports every time the beforeSubmitPrompt cost gate fired — blocked,
// confirmed, or purely informational — by reading this plugin's OWN
// ~/.cursor-cost-preview/activity.log (JSONL, one line per invocation,
// written by scripts/before-submit-prompt.cjs).
//
// Unlike the sibling prompt-cost-preview Claude Code plugin's own
// hook-activity-report.cjs (which parses Claude Code's session transcript
// JSONL to reconstruct hook firings after the fact, since Claude Code
// doesn't expose a first-party activity log), this script is simpler by
// construction: Cursor gives this plugin no session transcript to mine at
// all, but the hook script controls its own log format directly, so this
// just reads it back. No "no gate record" reconstruction step exists here
// for the same reason — every firing is guaranteed to have a log line,
// there's nothing else to cross-reference against.
//
// Usage:
//   node hook-activity-report.cjs             # console report
//   node hook-activity-report.cjs --json       # structured data
//   node hook-activity-report.cjs --html <path> # styled report card

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_FILE = path.join(os.homedir(), '.cursor-cost-preview', 'activity.log');

function readEvents() {
  let raw;
  try {
    raw = fs.readFileSync(LOG_FILE, 'utf8');
  } catch {
    return [];
  }
  const events = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Skip a corrupt line rather than failing the whole report.
    }
  }
  return events;
}

function buildReportData() {
  const events = readEvents();
  const counts = { blocked: 0, confirmed: 0, informational: 0 };
  for (const e of events) {
    if (counts[e.outcome] !== undefined) counts[e.outcome] += 1;
  }
  return {
    logFile: LOG_FILE,
    generatedAt: new Date().toISOString(),
    total: events.length,
    counts,
    events,
  };
}

function outcomeColor(outcome) {
  if (outcome === 'blocked') return '#dc2626';
  if (outcome === 'confirmed') return '#16a34a';
  return '#6b7280';
}

function renderConsole(data) {
  const lines = [];
  lines.push(`cursor-cost-preview — hook activity (${data.logFile})`);
  lines.push('');
  if (data.total === 0) {
    lines.push('No activity recorded yet — the gate hasn\'t fired in this Cursor install.');
    return lines.join('\n');
  }
  lines.push(`Total events: ${data.total}`);
  lines.push(`  informational: ${data.counts.informational}`);
  lines.push(`  blocked:       ${data.counts.blocked}`);
  lines.push(`  confirmed:     ${data.counts.confirmed}`);
  lines.push('');
  lines.push('Timeline:');
  for (const e of data.events.slice(-30)) {
    lines.push(`  [${e.timestamp}] ${e.outcome.padEnd(13)} bucket ${e.bucket}, ~$${Number(e.costMid).toFixed(3)}`);
  }
  if (data.events.length > 30) lines.push(`  ... (${data.events.length - 30} earlier events omitted)`);
  return lines.join('\n');
}

function renderHtml(data) {
  const rows = data.events
    .slice()
    .reverse()
    .map(
      (e) => `<tr>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td><span class="badge" style="background:${outcomeColor(e.outcome)}">${e.outcome}</span></td>
        <td>${e.bucket}</td>
        <td>$${Number(e.costMid).toFixed(3)}</td>
      </tr>`
    )
    .join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>cursor-cost-preview — hook activity</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; background: Canvas; color: CanvasText; }
  h1 { font-size: 22px; }
  .stat-strip { display: flex; gap: 16px; margin: 20px 0; }
  .stat { flex: 1; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); border-radius: 8px; padding: 14px; text-align: center; }
  .stat .n { font-size: 26px; font-weight: 700; }
  .stat .l { font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 14px; }
  .badge { color: white; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
</style>
</head>
<body>
<h1>cursor-cost-preview — hook activity</h1>
<p style="opacity:0.7">${data.logFile} · generated ${new Date(data.generatedAt).toLocaleString()}</p>
<div class="stat-strip">
  <div class="stat"><div class="n">${data.total}</div><div class="l">Total</div></div>
  <div class="stat"><div class="n">${data.counts.informational}</div><div class="l">Informational</div></div>
  <div class="stat"><div class="n">${data.counts.blocked}</div><div class="l">Blocked</div></div>
  <div class="stat"><div class="n">${data.counts.confirmed}</div><div class="l">Confirmed</div></div>
</div>
<table>
  <thead><tr><th>Time</th><th>Outcome</th><th>Bucket</th><th>Est. cost</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="4">No activity recorded yet.</td></tr>'}</tbody>
</table>
</body>
</html>`;
}

function main() {
  const args = process.argv.slice(2);
  const data = buildReportData();

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    return;
  }

  const htmlIdx = args.indexOf('--html');
  if (htmlIdx !== -1) {
    const outPath = args[htmlIdx + 1];
    if (!outPath) {
      console.error('--html requires a file path');
      process.exit(1);
    }
    fs.writeFileSync(outPath, renderHtml(data));
    console.log(`Wrote ${outPath}`);
    return;
  }

  console.log(renderConsole(data));
}

main();
