# cursor-cost-preview

See a prompt's estimated cost before you send it in Cursor's Composer/Chat.
100% local, zero network calls.

This is a **Cursor Plugin** (`.cursor-plugin/plugin.json` — Cursor's
native Skills/Hooks/MCP-server bundle format at `cursor.com/marketplace`),
not a VS Code-style extension. If you're looking for a sidebar/webview
extension with budget tracking and Firestore sync, that's a different,
separate product: [`extension-cursor/`](https://github.com/Gourav-Diwan/equation-adventure/tree/main/extension-cursor)
in the sibling `equation-adventure` repo, published to Open VSX instead.

## What it does

- **Hook** — `beforeSubmitPrompt` fires on every prompt you submit in
  Cursor, runs a small local neural/heuristic cost estimator against it,
  and shows an informational cost line. Set the `BLOCK_THRESHOLD_USD`
  plugin variable above `0` to hard-block a prompt estimated over that
  dollar amount — resend the identical prompt within 5 minutes to confirm
  and run it anyway (block → resend → confirm, single-use per prompt text).
- **Skill** — `hook-activity`: reports every time the gate fired on this
  machine (informational / blocked / confirmed), as a console report, JSON,
  or a styled HTML report card.

## What it deliberately does NOT do

No account, no sign-in, no "remaining budget against a monthly total" —
that's the companion `extension-cursor/` product's job (it syncs to a real
Firebase account). This plugin only ever estimates and gates a single
prompt at a time. It also can't distinguish Cursor's Chat mode from
Agent/Composer mode from the hook payload alone, so it always estimates in
agentic mode (the more expensive, more common Cursor usage pattern) — see
the comment in `scripts/before-submit-prompt.cjs` for why.

## Install for local testing

```bash
mkdir -p ~/.cursor/plugins/local/cursor-cost-preview
cp -r . ~/.cursor/plugins/local/cursor-cost-preview
```

Then in Cursor: `Cmd/Ctrl+Shift+P` → **Developer: Reload Window**, then
open **Customize** and confirm the plugin's hooks/skills are listed.

## Submit to the Cursor Marketplace

Once verified locally: `cursor.com/marketplace/publish`. Every plugin is
manually reviewed before listing.

## Where the estimator engine comes from

`lib/heuristic.js`, `lib/token-model-core.js`, `lib/token-model-weights.js`
are manually-ported copies of the same files from the `equation-adventure`
repo's `public/` directory (the single source of truth for the whole
Mathwizards / AI Budget Tracker product family — see that repo's CLAUDE.md).
There is no automated sync script here, matching the same "forked,
portable copy" precedent the sibling `prompt-cost-preview` Claude Code
plugin already established — re-copy manually after a base-model retrain
in the source repo if these estimates need to reflect newer training data.
Last synced: 2026-08-27, base model @ 442 rows (399 real-cost).

## License

MIT — see [LICENSE](LICENSE).
