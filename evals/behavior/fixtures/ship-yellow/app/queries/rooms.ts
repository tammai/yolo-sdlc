// Meeting rooms. Pages use these composables; they never call $fetch themselves.

export const roomKeys = {
  all: ['rooms'] as const,
}

// All meeting rooms, by name. Staff only.
export function useRooms() {
  const api = useRequestFetch()
  return useQuery({
    key: roomKeys.all,
    query: () => api('/api/rooms'),
  })
}

// Add a room, then refresh the list so it shows straight away.
export function useAddRoom() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (name: string) => $fetch('/api/rooms', { method: 'POST', body: { name } }),
    onSettled: () => queryCache.invalidateQueries({ key: roomKeys.all }),
  })
}
