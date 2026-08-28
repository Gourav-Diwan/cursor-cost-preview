---
name: hook-activity
description: Review every time the cursor-cost-preview cost gate fired on this machine — blocked, confirmed, or informational — plus a styled report card
---

Run this plugin's hook-activity report. Do the following steps in order,
with no added commentary beyond what's instructed:

1. **Console report** — run:
   ```
   node scripts/hook-activity-report.cjs
   ```
   (run from the plugin's own root directory)
   Show this output to the user verbatim.

2. **Structured data** — run:
   ```
   node scripts/hook-activity-report.cjs --json
   ```
   Use this if you need to reference specific events (timestamps, exact
   bucket/cost numbers) precisely rather than re-parsing the console text.

3. **Styled HTML report card** — write it to a scratch location, e.g.:
   ```
   node scripts/hook-activity-report.cjs --html /tmp/cursor-cost-preview-report.html
   ```
   Same underlying data as steps 1–2, rendered as a light/dark-themed
   report card: a stat strip (total / informational / blocked / confirmed)
   plus a timeline table of every event.

4. Open the generated HTML file for the user, or describe its contents if
   there is no way to open a local file in the current context.

After all steps, reply with the console output from step 1 — no other
commentary.

This report reads ONLY this plugin's own
`~/.cursor-cost-preview/activity.log`, written by `scripts/
before-submit-prompt.cjs` on every hook firing. It never touches
`pending-cost-confirmations.json`, and makes no network calls. If the log
is empty, the gate hasn't fired yet on this machine — confirm the plugin
is actually enabled (Cursor Settings → Plugins) and that
`BLOCK_THRESHOLD_USD` (if you're testing the block path specifically) is
set above 0.
