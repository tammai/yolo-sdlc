---
name: update-app
description: "Engineers: bring an existing yolo-sdlc app's plugin-owned files (risk rules, gate, CI workflows, safety middleware, UI template shells, CLAUDE.md, REVIEW.md) up to the installed plugin version, on a new branch, without touching the app's own work. Use after updating the yolo-sdlc plugin, or when someone types /yolo-sdlc:update-app."
---

# /yolo-sdlc:update-app: keep an app's safety files current

The plugin's skills and reviewer update by themselves. But the parts GitHub and Cloudflare run without Claude live in each app's repo, and they only change when this skill runs. That's the risk tiers, the merge gate, the CI workflows, the deploy guard and the UI shell.

**What it writes:** exactly the paths in `${CLAUDE_PLUGIN_ROOT}/scripts/managed.json`.
**What it never touches:** the app's own work. That's pages, queries, API routes, the schema, migrations, intents, content, example tests, `wrangler.jsonc`, `app.registry.json` and `app/app.config.ts`.

## Steps

1. **Start clean.** In the app's folder: `git switch main && git pull`. `git status` must be clean.

2. **Update:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/update-app.mjs"
   ```
   It creates the branch `yolo-sdlc-update-<version>`, writes the managed files, and commits. It prints:
   - **Updated:** what changed. Read the diff (`git show --stat`, then `git show`) and summarise it in plain words.
   - **Kept:** extra files in plugin-owned folders that an engineer added. They're left alone.
   - **Dependencies differ:** versions the plugin expects but the app has differently. They're *not* changed. Decide with the engineer whether to align them (`pnpm add <dep>@<version>`), then commit. The one exception: a package the plugin's own scripts can't run without (`requiredDevDependencies` in `managed.json`, today Cloudflare's `cf`) is added when the app has none, and shows under **Updated**.
   - **From 0.4.6, deploys run through Cloudflare's `cf` CLI.** Tell the engineer plainly: `cf` 1.0.0-beta.5 can't yet deploy a Nuxt build (cloudflare/cf#17, #18), so once this merges, Workers Builds deploys fail at the dry-run step, before any live migration, until Cloudflare fixes it. Suggest trying it on a branch with the preview Worker first (docs/SETUP.md §4).

3. **Prove it:** `pnpm install && pnpm check`. If a check fails, the app's code may depend on something the update changed. Fix it on this branch and explain what and why.

4. **Ship it** with `/yolo-sdlc:ship`. It's red (engineer-owned files), so it gets the engineer review before it's pushed.
