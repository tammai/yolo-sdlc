// Each test is one example from intent/2026-09-24-meeting-rooms.md, with the example
// sentence as its title, word for word. If the example changes, the intent changes first.
import { expect, test } from '@playwright/test'
import { open, shot } from './helpers'

test('When I add a room called "Blue room", I see "Blue room" in the Rooms list.', async ({ page }) => {
  await open(page, '/rooms')
  // Reruns share the local database, so count before and after instead of expecting one.
  const blueRooms = page.getByTestId('room').filter({ hasText: /^\s*Blue room\s*$/ })
  const before = await blueRooms.count()

  await page.getByLabel('Room name').fill('Blue room')
  await page.getByRole('button', { name: 'Add room' }).click()

  await expect(blueRooms).toHaveCount(before + 1)
  await expect(page.getByLabel('Room name')).toHaveValue('')
  await shot(page, 'meeting-rooms-added')
})

test('When I try to add a room with no name, I see "Please give the room a name." and nothing is added.', async ({ page }) => {
  await open(page, '/rooms')
  const rooms = page.getByTestId('room')
  const before = await rooms.count()

  await page.getByRole('button', { name: 'Add room' }).click()

  await expect(page.getByText('Please give the room a name.')).toBeVisible()
  await expect(rooms).toHaveCount(before)
  await shot(page, 'meeting-rooms-no-name')

  // Nothing was saved either: a fresh load shows the same list.
  await open(page, '/rooms')
  await expect(rooms).toHaveCount(before)
})
