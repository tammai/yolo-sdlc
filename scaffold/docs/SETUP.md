# Setting up a new app (engineer checklist)

About 30 minutes, once per app. Afterwards the app's owner works in the Claude desktop app, and you only see the pull requests the risk tier sends you.

## 1. Repository

1. Create a private GitHub repo from this folder, named after the app: `gh repo create <org>/<name> --private --source . --remote origin --push`. (`/yolo-sdlc:new-app` made the folder and its first commit.)
2. Check `app.registry.json`. `/yolo-sdlc:new-app` filled in the name, `type`, `data` and a `reviewBy` date 6 months out, plus the owner from your GitHub sign-in and the reviewers you chose. Add a one-line description if it's missing.
   - `type`: `prototype` (preview only, fake data), `public` (anyone can open it), or `internal` (staff only, behind Access).
   - `data`: `public`, `internal`, or `personal`. Choose `personal` for anything HR-like, and every yellow change becomes red.
   - `reviewers.yellow` / `reviewers.red`: optional. People who can approve instead of the engineer review, or instead of each other when `claudeReview` is `false`. None, one or several are all fine. With none, the Claude engineer review alone clears yellow and red, and the session tells the person each time a change turns yellow or red. GitHub won't let anyone approve their own pull request.
   - With `claudeReview: false`, list at least one reviewer, or yellow and red changes can never merge.
3. Replace `@TODO-org/engineers` in `.github/CODEOWNERS`.
4. Add the owner as a collaborator with **write** access (not admin).

## 2. Cloudflare resources

Every Cloudflare step here uses Cloudflare's `cf` CLI (the app pins it in `package.json`). Run these from your own terminal, never a Claude session: the hook blocks every online `cf` command there. Sign in once with `pnpm exec cf auth login`. Every command below takes `--dry-run` to show the request without sending it.

```bash
pnpm exec cf d1 create --name <app>-db
pnpm exec cf d1 create --name <app>-db-preview
pnpm exec cf kv namespaces create --title <app>-kv
pnpm exec cf kv namespaces create --title <app>-kv-preview
```

Put the IDs, the Worker `name`, and `APP_TYPE` (the same as `type` in the registry) into `wrangler.jsonc` for both the top level and `env.preview`. It's the one place IDs are written: `nuxt dev` and `wrangler deploy` read it, and the deploy script hands `cf` the database IDs from it. Commit this on `main` before the owner starts. From then on the file is red tier.

## 3. Sign-in and bot protection

- **Internal apps:** an Access application on each Worker's hostname (production and `-preview`). Write the application to a file, check it with `--dry-run`, then create it:
  ```bash
  # access-<name>.json — use your company's email domain or a group. Don't reuse an existing
  # "Allow emails" policy: it lets in everyone listed for *other* apps.
  # { "type": "self_hosted", "name": "<name>", "domain": "<name>.<subdomain>.workers.dev",
  #   "policies": [{ "name": "<name> staff", "decision": "allow", "include": [{ "email_domain": { "domain": "example.com" } }] }] }
  pnpm exec cf zero-trust access applications create --body @access-<name>.json --dry-run
  pnpm exec cf zero-trust access applications create --body @access-<name>.json
  pnpm exec cf zero-trust organizations list     # auth_domain is your <team>.cloudflareaccess.com
  ```
  Copy the application's `aud` into `ACCESS_AUD`, and `auth_domain` into `ACCESS_TEAM_DOMAIN`, for that environment in `wrangler.jsonc`. Repeat for `<name>-preview`. `wrangler.jsonc` sets `"preview_urls": false`, so there are no per-version addresses (`*-<name>.<subdomain>.workers.dev`) outside this application. If an app turns them on, add them to the body: `"self_hosted_domains": ["<name>.<subdomain>.workers.dev", "*-<name>.<subdomain>.workers.dev"]`. Or use the dashboard instead: the Worker's **Access** tab → **Protect this Worker behind Access** → scope **All traffic**, which covers them. The app's own sign-in check refuses them either way.
- **Public apps:** protect only `/reports*` and `/api/feedback` for GET with an Access application on those paths (the same command, with `"domain": "<name>.<subdomain>.workers.dev/reports"` and a second one for `/api/feedback`). Create a Turnstile widget, put its site key in `TURNSTILE_SITE_KEY`, and set its secret on both Workers (you're asked for the value, and it isn't shown):
  ```bash
  pnpm exec cf turnstile widgets create --name <name> --domains <name>.<subdomain>.workers.dev --domains <name>-preview.<subdomain>.workers.dev
  pnpm exec cf workers secrets update TURNSTILE_SECRET_KEY --worker <name>
  pnpm exec cf workers secrets update TURNSTILE_SECRET_KEY --worker <name>-preview
  ```
- **Prototypes:** protect the preview hostname with Access. They have no production deploy (see step 4).

## 4. Deploys: Cloudflare Workers Builds

Nobody deploys from a laptop, and no Cloudflare token lives in GitHub. Both deploy commands run `scripts/deploy-guard.mjs`: a `wrangler deploy --dry-run` first, then migrations with `cf d1 migrations apply <database-id>`, then `wrangler deploy` (reading `wrangler.jsonc`; `--env preview` for the preview Worker).

Connect the GitHub repo once in the dashboard (Workers → the app → Settings → Builds): installing Cloudflare's GitHub app has no `cf` command yet. The build settings below can then be set there, or with `cf builds triggers create` (see `pnpm exec cf builds triggers create --help`; every option has `--dry-run`).

> Why the upload is still Wrangler's: `cf` is in beta (pinned at 1.0.0-beta.5), and its `cf deploy` can't deploy a Nuxt build yet. Tried in Workers Builds on 2026-09-29, it handed the build to Nuxt and stopped: "`pnpm nuxt build` does not currently support `--mode`" ([cf#45](https://github.com/cloudflare/cf/issues/45)). Behind that, it expects Cloudflare's new build output, which Nitro doesn't write ([cf#18](https://github.com/cloudflare/cf/issues/18), [cf#17](https://github.com/cloudflare/cf/issues/17); on Windows also [cf#19](https://github.com/cloudflare/cf/issues/19)). When those are fixed, the two `wrangler deploy` steps in the deploy script can move to `cf deploy`.

Connect **two Workers** to the same repo. The second one exists only for previews.

**`<name>`, the production Worker**

| Setting | Value |
| --- | --- |
| Production branch | `main` (prototypes: a branch nobody pushes to, e.g. `never`) |
| Build command | `pnpm build` |
| Deploy command | `pnpm deploy:production` |
| Non-production branch builds | **off** |

**`<name>-preview`, the preview Worker**

| Setting | Value |
| --- | --- |
| Production branch | `main` (Workers Builds can't switch production builds off, so make them harmless instead) |
| Build command | `pnpm build` |
| Deploy command | `pnpm deploy:preview` |
| Non-production branch builds | on |
| Non-production deploy command | `pnpm deploy:preview` |

Both deploy commands are `pnpm deploy:preview`, so every build of this Worker, from `main` or a branch, uses the preview settings, database and KV. A merge to `main` just refreshes the preview.

> ⚠️ **Never turn on non-production builds on the production Worker with `pnpm deploy:preview`.** Workers Builds always deploys to the Worker it's connected to. `--env preview` only swaps the settings, so an unreviewed branch replaces production and runs against the preview database. This was verified the hard way on 2026-09-24. Previews share one preview Worker with its own D1 and KV, and the last branch pushed wins.

## 5. Branch protection on `main`

Use a ruleset (Settings → Rules → Rulesets) targeting `main`:

- Require a pull request before merging. **Required approvals: 0.** The `risk-tier` check decides who must approve.
- *Optional:* require review from Code Owners. With it on, changes to engineer-owned files always need a person, even when the Claude engineer review has cleared them. Leave it off to let Claude clear every red change.
- Require status checks: `checks` (from `ci`) and `risk-tier`.
- Block force pushes. Nobody on the bypass list.

Then open one test pull request to check that the `risk-tier` comment and label appear. They appear only after the workflow exists on `main`.

## 5b. The engineer review

Yellow and red changes are reviewed in the author's own Claude session at `/yolo-sdlc:ship`, by a separate `yolo-sdlc:engineer-reviewer` subagent that didn't write the change. It checks the branch against `REVIEW.md`, and its findings are **warnings**: the author's Claude offers to fix them, then posts the review on the pull request (`pnpm review:post`). The merge gate lets the change through when a review exists for the pull request's current commit.

- No API key or setup needed: it runs on the author's Claude.
- The review comment is a **record, not a lock**. Anyone with write access could post one by hand. The hard protections are the session hook, the risk tiers and the main-only deploy guard.
- `"claudeReview": false` in `app.registry.json` means only people can clear yellow and red: `reviewers.yellow` or `reviewers.red` for yellow, `reviewers.red` for red.

## 6. The owner's machine

The owner needs the Claude desktop app, Node 22+, pnpm (`npm i -g pnpm`) and git, signed in to GitHub. Then:

```bash
git clone <repo> && cd <repo>
pnpm install
pnpm db:migrate:local
pnpm dev
```

Open the folder in Claude. The hooks in `.claude/settings.json` load automatically.

> **Windows: keep the clone at a short path**, for example `C:\Users\<name>\apps\<repo>`. Nuxt's dependencies nest deeply, and under a long path (such as a temp or OneDrive folder) `pnpm install` fails with `Loading @nuxt/nitro-server server builder failed`. That's Windows' 260-character path limit, not a broken install. Enabling long paths (`git config --global core.longpaths true` plus the Windows `LongPathsEnabled` policy) also fixes it.

**Engineers working in the repo** should add this to their own `~/.claude/settings.json`, which unlocks engineer-owned files in their sessions:

```json
{ "env": { "RISK_TIER_ROLE": "engineer" } }
```

The `block` rules (secrets, destructive migrations) still apply to engineers, and CI still gates every merge.

### Cloudflare's `cf` CLI

Cloudflare released `cf` in open beta on 2026-09-28. It reaches the whole Cloudflare API, about 3,000 operations. Every Cloudflare action in these apps goes through `cf` except the upload itself: creating resources, Access, Turnstile, secrets, Workers Builds, migrations on the live database, rollbacks, and `/yolo-sdlc:triage`'s read of problem reports. Wrangler does the upload (`wrangler deploy`, until `cf deploy` can deploy a Nuxt build: see §4) and what runs on this computer: `nuxt dev`'s local bindings, `pnpm db:migrate:local` (which `pnpm check` runs before the browser checks, in CI too), and `pnpm preview`. `cf --local` keeps its state outside the project, where `nuxt dev` wouldn't see it, so the local database stays on Wrangler until that lines up. In a session, the hook allows only a few `cf` forms that provably stay on the computer: `cf cli search "…"`, `cf <command> --help` (as the last word), `cf d1 migrations create <name>`, and `cf --version`. A trailing redirect that writes nothing (`2>&1`, `2>/dev/null`) doesn't count as a word. `cf dev` isn't one of them, since it can reach live resources, and the app runs with `pnpm dev` anyway. Everything else is blocked for everyone, engineers included, like `wrangler deploy`: deploys, live databases, KV, secrets, sign-in and account settings. Engineers run those from their own terminal. The hook looks for `cf` anywhere in a command, so wrapped forms count too (`bash -c "cf deploy"`, `env cf …`, `./node_modules/.bin/cf …`). That errs on the safe side: a commit message containing "cf deploy" is blocked as well. A `YOLO_SDLC_GH` set outside a session, for example in a shell profile, isn't caught. That's no worse than today: anyone with write access can post a review comment by hand, which is why the review record is a record, not a lock, and the merge gate plus the deploy guard are what enforce. The managed-settings example blocks every `cf` command for non-engineers, local ones included.

## 7. Managed settings (recommended for a whole team)

The hooks in `.claude/settings.json` live in the app's repo, and someone with the right permissions could edit them. To hold the guard rails on every non-engineer's machine regardless, an admin deploys Claude Code **managed settings**. Project and user settings can't override them. Start from `docs/managed-settings.example.json`:
- installs and enables the plugin
- denies deploy, rollback, secret and admin-merge commands
- denies reading `.dev.vars` and `.env` files
- disables bypass-permissions mode
- pins `RISK_TIER_ROLE` to non-engineer

Deploy it through the Claude admin console, or as `managed-settings.json` in the system folder named in the file. Don't deploy it to engineers' machines.

## 8. Policies and lessons

- **`POLICIES.md`**: your organisation's rules for what apps may do, such as personal data, retention, outside services and announcements. `/yolo-sdlc:shape` checks every idea against it and records **Policy concerns** in the intent. `/yolo-sdlc:build` won't start while a sign-off is pending, and the engineer review checks the result. The file ships with starter policies: replace them with yours, and have legal, HR or security confirm them.
- **`LEARNED.md`**: lessons from this app's own history. `CLAUDE.md` imports it, and the reviewer reads its **For review** section. Run `/yolo-sdlc:learn` now and then (monthly, say): it gathers repeated verifier issues and review warnings and proposes one-line lessons, which you approve.

Both files belong to the app, and `/yolo-sdlc:update-app` only creates them when they're missing. Both are engineer-owned.

## 9. When something goes wrong in production

Follow `docs/ROLLBACK.md`. Rolling back is always done by an engineer, never from a Claude session.

Run `/yolo-sdlc:triage` to turn **Report a problem** submissions into draft intents, and `/yolo-sdlc:report` for per-stage delivery metrics. Triage reads only each report's id, message, page and date, never who sent it, with one fixed query. The messages still enter the engineer's Claude session, so don't use it on an app whose reports may contain sensitive details. Any other read of live data happens in the engineer's own terminal: the session hook blocks every `--remote` database command, and every online `cf` command.

## What each layer is for

| Layer | Where | Purpose | Can the session get round it? |
| --- | --- | --- | --- |
| `CLAUDE.md` | session | Tells Claude how to work and talk | Advisory only |
| `scripts/risk-tier/hook.mjs` | session | Blocks secrets, destructive SQL, deploys and engineer-owned edits; says when the tier changes | Mostly no. It's best-effort against shell tricks, which is why CI exists |
| `risk-tier` workflow | GitHub | Re-classifies from the base branch and requires the right approval | No. It runs the base branch's code, not the PR's |
| Branch protection and CODEOWNERS | GitHub | Makes the checks mandatory | Only an org admin can |
| Access / Turnstile / `requireUser` | runtime | Who can use the app | Engineer-owned code, red tier |
