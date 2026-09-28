import { asc } from 'drizzle-orm'
import { rooms } from '../db/schema'

// Staff only: the list of meeting rooms, by name.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return useDb(event).select().from(rooms).orderBy(asc(rooms.name))
})
