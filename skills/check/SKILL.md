---
name: check
description: "Show the person that each agreed example works: run all checks, look at every screenshot, then let them choose between seeing example → result → picture or trying the app themselves on a local dev server, and ask 'is this what you wanted?'. Use after /yolo-sdlc:build, before shipping, or when someone asks 'does it work?', 'show me', or types /yolo-sdlc:check."
---

# /yolo-sdlc:check: show, don't tell

The person can't read code, but they can look at a page and say "yes, that's it". Your job is to put the evidence in front of them and get an honest answer.

## Steps

1. **Run everything:** `pnpm check` (typecheck, risk-rule tests, and every example check). If anything fails, don't show a half result. Go back and fix it (`/yolo-sdlc:build`'s loop), then run it again.

2. **Look at every screenshot yourself.** Open each `test-results/screens/<slug>-<n>.png` and confirm it *visibly* shows what its example says. A check can pass while the page looks wrong: broken layout, placeholder text, or the right data in the wrong place. If a picture doesn't match its example, treat it as a failure and fix it.

3. **Ask how they want to check it, with `AskUserQuestion`:** "Everything passes my checks. How would you like to check it yourself?" with two options:
   - **Show me the results:** you walk them through each example with its picture.
   - **I'll try it myself:** you start the app on their computer and they click around.

   **If they pick "Show me the results"**, present one row per agreed example, in the person's words:

   | Example | Result | Picture |
   | --- | --- | --- |
   | When I add a new hire, I see them in the list | ✅ works | `test-results/screens/new-hire-1.png` |

   Give the picture as a clickable path.

   **If they pick "I'll try it myself"**, get the app ready, then hand it over:
   1. If the change added a table, run `pnpm db:migrate:local` first.
   2. Run `pnpm dev` in the background and wait until it answers. Use the address it prints, since it isn't always port 3000.
   3. Tell them the address, that they're signed in as a test user (nothing they do touches real data), and give the agreed examples as a short "try this" list in their own words:
      - When I add a new hire, I should see them in the list
   4. Say: "Click around, and tell me when you're done. I'll stop it then." Then stop and wait. Don't ask the question in step 5 until they're back.
   5. When they come back, stop the dev server before going on.

4. **Say the risk tier now, not at the end:** run `pnpm risk` and explain it in one or two sentences, using its wording. No surprises at `/yolo-sdlc:ship`.

5. **Ask with `AskUserQuestion`:** "Is this what you wanted?" with options **Yes, ship it** / **Almost: something small is off** / **No, it's not what I meant**.
   - **Yes:** "Say **/yolo-sdlc:ship** and I'll send it for review and go-live."
   - **Something's off:** write down what they said. If it changes an agreed example, update the example in the intent first (and set `status: agreed`), then `/yolo-sdlc:build` again. Don't quietly patch it without updating the example.
   - **They want more:** that's a new idea. Suggest `/yolo-sdlc:idea` after this one ships.

## Don't

- Don't say "all tests pass" without the table. The table is the result.
- Don't paste code or logs unless they ask.
