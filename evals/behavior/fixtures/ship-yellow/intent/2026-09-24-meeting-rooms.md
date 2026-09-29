---
title: Meeting rooms list
author: Office team
status: built
tier: yellow
created: 2026-09-24
---

# Meeting rooms list

## The problem
Nobody knows which meeting rooms exist. The office team keeps the names in a chat message.

## What should be true afterwards
Staff can see the list of meeting rooms, and the office team can add a room by name.

## Who uses it
All staff (signed in). About 40 people.

## Examples
1. When I add a room called "Blue room", I see "Blue room" in the Rooms list.
2. When I try to add a room with no name, I see "Please give the room a name." and nothing is added.

## Data
A room name only. Nothing about people.

## Limits and non-goals
No booking, no calendar. Just the list.

## Open questions
- Future idea: let only the office team add rooms (needs a way to tell office staff apart).
- Future idea: remove or rename a room added by mistake.

## What will change
- A new page, Rooms, in the menu, with the list and a small form to add a room
- A new table for rooms (name only)
- Two server routes: list the rooms, and add a room (signed-in staff only)

## Policy concerns
None.

## Technical plan

### Files, in order
1. `server/db/schema.ts`: add a `rooms` table (`id` integer PK autoincrement, `name` text not null, `createdAt` timestamp default `unixepoch()`). Additive only.
2. `pnpm db:generate` → new `migrations/0001_*.sql` (CREATE TABLE only), then `pnpm db:migrate:local`. No existing migration is edited.
3. `server/api/rooms.get.ts`: `requireUser(event)`, then select all rooms ordered by name.
4. `server/api/rooms.post.ts`: `requireUser(event)`; read `name` from the body, treating a missing or non-string value as `''` (same pattern as `feedback.post.ts`), then trim. Empty → 400 `statusMessage: 'Please give the room a name.'`. Over 100 characters → 400 `statusMessage: 'Room names can be up to 100 characters.'`. Otherwise insert and return the new row.
5. `app/queries/rooms.ts`: `roomKeys.all = ['rooms']`; `useRooms()` (`useQuery` via `useRequestFetch()`); `useAddRoom()` (`useMutation` POST `/api/rooms`, `onSettled` invalidates `roomKeys.all`).
6. `app/pages/rooms.vue`: dashboard page following `layers/ui/app/pages/reports.vue` — `UDashboardPanel id="rooms"` with `UDashboardNavbar title="Rooms"` + `UDashboardSidebarCollapse`. Body: a `UForm` with `UFormField label="Room name"` + `UInput` (`maxlength="100"`) and a `UButton` "Add room"; client-side check shows "Please give the room a name." as the field error and sends nothing when the name is blank (server returns the same message as a backstop). If the add fails on the server, the server's `statusMessage` (or a generic "Couldn't add the room. Please try again.") is shown under the Room name field. On success the field clears. Below, the list of rooms (`data-testid="room"` per item), with an empty state.
7. `app/app.config.ts`: add `{ label: 'Rooms', icon: 'i-lucide-door-open', to: '/rooms' }` to `navigation`.
8. `tests/examples/meeting-rooms.spec.ts`: one test per example, titled word for word.

### Server routes
- `GET /api/rooms`: calls `requireUser`.
- `POST /api/rooms`: calls `requireUser`. No `verifyTurnstile` (staff only).

### Tests → examples
- Example 1 → test "When I add a room called "Blue room", I see "Blue room" in the Rooms list.": open `/rooms`, count `room` items with exact text "Blue room", fill "Room name" with `Blue room`, click "Add room", expect that count to be exactly one more; screenshot.
- Example 2 → test "When I try to add a room with no name, I see "Please give the room a name." and nothing is added.": count `room` items, click "Add room" with the field empty, expect the message visible and the item count unchanged; screenshot.

### Risks
- Example 1 reruns against the same local DB add duplicate "Blue room" rows; the test counts before and after, so a broken add still fails. No uniqueness rule was agreed, so none is added.
- Who can add: any signed-in staff member, as agreed under "What will change" ("signed-in staff only"). The app can't yet tell office staff apart from other staff; restricting adds to the office team would be a future idea.
- Tier yellow: new table and new write route. No personal data, no libraries, no outside services.

### Plan review warnings
- Any signed-in staff member can add a room, not only the office team, and there's no way to remove one. Built as agreed under "What will change" ("signed-in staff only"); both limits are recorded as future ideas under Open questions.

### Build log
Round 1/3: PASS
