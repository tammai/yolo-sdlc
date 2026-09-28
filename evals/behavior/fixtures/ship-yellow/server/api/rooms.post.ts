import { rooms } from '../db/schema'

// Staff only: add a meeting room by name.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const body = await readBody<{ name?: unknown }>(event)

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'Please give the room a name.' })
  }
  if (name.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Room names can be up to 100 characters.' })
  }

  const [room] = await useDb(event).insert(rooms).values({ name }).returning()
  return room
})
