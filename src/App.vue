<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted, computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Header from './components/Layout/Header.vue'
import ToastNotification from './components/Common/ToastNotification.vue'
import UpdatePrompt from './components/Common/UpdatePrompt.vue'
import { useConfigStore } from './stores/config'
import { useChatStore } from './stores/chat'
import { useChat } from './composables/useChat'
import { initializeDesktopPersistence } from './platform/metadataStore'
import { isTauriRuntime } from './platform/runtime'

// 懒加载重型组件
const HistorySidebar = defineAsyncComponent(() => import('./components/Layout/HistorySidebar.vue'))
const ConfigModal = defineAsyncComponent(() => import('./components/Config/ConfigModal.vue'))

const configStore = useConfigStore()
const { t } = useI18n()
const chatStore = useChatStore()
const { ensureCurrentChatSaved, hydrateHistoryList } = useChat()
const route = useRoute()
const router = useRouter()
const showConfigGuide = ref(false)
const dismissedConfigGuide = ref(false)
const showSidebar = ref(false)
const isPersistenceReady = ref(false)
const persistenceError = ref(false)
const isChatRoute = computed(() => route.name === 'chat')

function syncConfigGuide() {
  showConfigGuide.value =
    !dismissedConfigGuide.value && !configStore.isConfigured && isChatRoute.value
}

watch([() => configStore.isConfigured, () => route.name], syncConfigGuide, { immediate: true })

async function syncCurrentChatHistory() {
  try {
    await ensureCurrentChatSaved()
  } catch (error) {
    console.error('Failed to sync current chat to history:', error)
  }
}

async function initializePersistence() {
  persistenceError.value = false
  try {
    if (isTauriRuntime()) {
      await initializeDesktopPersistence()
      await configStore.hydrateFromPersistence()
    }
    await chatStore.hydrateFromPersistence()
    await hydrateHistoryList()
    await syncCurrentChatHistory()
    syncConfigGuide()
    isPersistenceReady.value = true
  } catch (error) {
    console.error('Failed to initialize persistence:', error)
    persistenceError.value = true
  }
}

onMounted(async () => {
  await initializePersistence()
})

function toggleConfig() {
  router.push({ name: 'settings' })
}

function closeConfigGuide() {
  dismissedConfigGuide.value = true
  showConfigGuide.value = false
}

async function toggleSidebar() {
  if (!isChatRoute.value) {
    await router.push({ name: 'chat' })
    await syncCurrentChatHistory()
    showSidebar.value = true
    return
  }

  if (!showSidebar.value) {
    await syncCurrentChatHistory()
  }
  showSidebar.value = !showSidebar.value
}

function closeSidebar() {
  showSidebar.value = false
}
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <Header @toggle-config="toggleConfig" @toggle-sidebar="toggleSidebar" />

    <!-- Main Content -->
    <main class="main-content">
      <!-- History Sidebar -->
      <Suspense>
        <HistorySidebar
          v-if="showSidebar && isChatRoute"
          :is-open="showSidebar"
          @close="closeSidebar"
        />
      </Suspense>

      <div v-if="!isPersistenceReady" class="persistence-state" role="status">
        <template v-if="persistenceError">
          <p>{{ t('storageInitializationFailed') }}</p>
          <button type="button" class="retry-button" @click="initializePersistence">
            {{ t('retry') }}
          </button>
        </template>
        <p v-else>{{ t('loading') }}</p>
      </div>

      <!-- Routed Content -->
      <div v-else class="content-area">
        <RouterView v-slot="{ Component }">
          <Transition name="route" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <!-- Config Modal -->
    <Suspense>
      <Transition name="modal">
        <ConfigModal v-if="isPersistenceReady && showConfigGuide" @close="closeConfigGuide" />
      </Transition>
    </Suspense>

    <!-- Toast Notification -->
    <ToastNotification />

    <!-- PWA Update Prompt -->
    <UpdatePrompt />
  </div>
</template>

<style scoped>
.app-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--gradient-bg);
  isolation: isolate;
}

/* Ambient gradient glow behind the whole app */
.app-container::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--gradient-glow);
  pointer-events: none;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.persistence-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-secondary);
}

.retry-button {
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  cursor: pointer;
}

/* Route Transition */
.route-enter-active,
.route-leave-active {
  transition:
    opacity var(--transition-base),
    transform var(--transition-base);
}

.route-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.route-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all var(--transition-base);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95);
}
</style>
