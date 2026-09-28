---
name: new-app
description: "Engineers: create a new yolo-sdlc app (Nuxt UI + Cloudflare, risk tiers, engineer review) in a new folder, with the right UI shell for its type, then hand over the setup checklist. Use when someone wants to start a new app for a team, or types /yolo-sdlc:new-app."
---

# /yolo-sdlc:new-app: start a new app

This is an **engineer** step. It creates the repo that non-engineers then work in with `/yolo-sdlc:idea` → `/yolo-sdlc:ship`.

## Steps

1. **Ask with `AskUserQuestion`**, all in one call:
   - **Type:** *internal* (staff only, behind Cloudflare Access, dashboard UI) / *public* (anyone, landing UI) / *prototype* (preview only, fake data, starter UI)
   - **Data:** *internal* / *personal* (anything about people, e.g. HR: every yellow change is treated as red) / *public*
   - **Name:** offer 2–3 short kebab-case names from what they said (e.g. `leave-tracker`). "Other" lets them type one.
   - **Folder:** default `<current folder>/<name>`. On Windows keep it short, e.g. `C:\Users\<name>\apps\<name>`. Deep paths break `pnpm install`.

2. **Create it:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/new-app.mjs" <folder> --name <name> --type <type> --data <data> --description "<one sentence: what it's for>"
   ```
   It copies the scaffold, fills in the name, type and a review date, installs the UI shell (dashboard / landing / starter), and makes the first commit. The owner and yellow reviewer default to the GitHub account `gh` is signed in as. Pass `--owner <handle>` if the owner is someone else.

3. **Install and prove it works**, inside the new folder:
   ```bash
   pnpm install
   pnpm db:migrate:local
   pnpm exec playwright install chromium
   pnpm check
   git add -A && git diff --cached --quiet || git commit -m "Install dependencies"
   ```
   The install often changes nothing, and then there's nothing to commit.
   `pnpm check` must pass before handing over. If it doesn't, fix it or report it. Don't hand over a broken app.

4. **Hand over** `docs/SETUP.md` as a checklist, in plain words: the GitHub repo and its ruleset, Cloudflare D1/KV, Access or Turnstile, the two Workers Builds, and the owner's machine. Offer to do the parts that can be done from here, and ask before each one, since they create things in their accounts:
   - the private repo: `gh repo create <org>/<name> --private --source . --remote origin --push`
   - the ruleset on `main` (SETUP §5), through `gh api repos/<org>/<name>/rulesets`
   - the test pull request SETUP §5 asks for: a green change that should get the `risk:green` label and pass both checks

   Name what's still `TODO` in `app.registry.json` (a second engineer under `reviewers.red`, and the Cloudflare URLs once the Workers exist).

5. **Next:** once it's set up, the owner opens the folder in Claude. The `yolo-sdlc` plugin is enabled by the repo's settings, and they start with `/yolo-sdlc:idea`.
