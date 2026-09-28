<script setup lang="ts">
import type { FormError } from '@nuxt/ui'

useHead({ title: 'Rooms' })

const { data: rooms, isLoading } = useRooms()
const addRoom = useAddRoom()

const state = reactive({ name: '' })
const form = useTemplateRef('form')

function validate(s: typeof state): FormError[] {
  return s.name.trim() ? [] : [{ name: 'name', message: 'Please give the room a name.' }]
}

async function onSubmit() {
  try {
    await addRoom.mutateAsync(state.name.trim())
    state.name = ''
    form.value?.clear()
  } catch (error) {
    const err = error as { statusMessage?: string; data?: { statusMessage?: string } }
    form.value?.setErrors([
      { name: 'name', message: err.data?.statusMessage ?? err.statusMessage ?? "Couldn't add the room. Please try again." },
    ])
  }
}
</script>

<template>
  <UDashboardPanel id="rooms">
    <template #header>
      <UDashboardNavbar title="Rooms">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-xl space-y-6">
        <UForm ref="form" :state="state" :validate="validate" :validate-on="[]" class="flex items-start gap-2" @submit="onSubmit">
          <UFormField label="Room name" name="name" class="flex-1">
            <UInput v-model="state.name" maxlength="100" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Add room" icon="i-lucide-plus" class="mt-6" :loading="addRoom.isLoading.value" />
        </UForm>

        <UEmpty
          v-if="!isLoading && !rooms?.length"
          icon="i-lucide-door-open"
          title="No rooms yet"
          description="Add the first meeting room above."
        />
        <ul v-else class="divide-y divide-default rounded-md border border-default">
          <li v-for="room in rooms" :key="room.id" data-testid="room" class="px-4 py-3">{{ room.name }}</li>
        </ul>
      </div>
    </template>
  </UDashboardPanel>
</template>
