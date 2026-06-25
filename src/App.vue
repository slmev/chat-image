<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted, computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import Header from './components/Layout/Header.vue'
import ToastNotification from './components/Common/ToastNotification.vue'
import UpdatePrompt from './components/Common/UpdatePrompt.vue'
import { useConfigStore } from './stores/config'
import { useChatStore } from './stores/chat'
import { initializeDesktopPersistence } from './platform/metadataStore'
import { isTauriRuntime } from './platform/runtime'

// 懒加载重型组件
const HistorySidebar = defineAsyncComponent(() => import('./components/Layout/HistorySidebar.vue'))
const ConfigModal = defineAsyncComponent(() => import('./components/Config/ConfigModal.vue'))
const GalleryView = defineAsyncComponent(() => import('./components/Gallery/GalleryView.vue'))

const configStore = useConfigStore()
const chatStore = useChatStore()
const route = useRoute()
const router = useRouter()
const showConfigGuide = ref(false)
const dismissedConfigGuide = ref(false)
const showSidebar = ref(false)
const showGallery = ref(false)
const isChatRoute = computed(() => route.name === 'chat')
const isSettingsRoute = computed(() => route.name === 'settings')

function syncConfigGuide() {
  showConfigGuide.value = !dismissedConfigGuide.value &&
    !configStore.isConfigured &&
    !isSettingsRoute.value
}

watch(
  [() => configStore.isConfigured, () => route.name],
  syncConfigGuide,
  { immediate: true },
)

onMounted(async () => {
  if (isTauriRuntime()) {
    await initializeDesktopPersistence()
    await Promise.all([
      configStore.hydrateFromPersistence(),
      chatStore.hydrateFromPersistence(),
    ])
  }
  syncConfigGuide()
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
  }
  showSidebar.value = !showSidebar.value
}

function closeSidebar() {
  showSidebar.value = false
}

function toggleGallery() {
  showGallery.value = !showGallery.value
}
</script>

<template>
  <div class="app-container">
    <!-- Header -->
    <Header
      @toggle-config="toggleConfig"
      @toggle-sidebar="toggleSidebar"
      @toggle-gallery="toggleGallery"
    />

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

      <!-- Routed Content -->
      <div class="content-area">
        <RouterView />
      </div>
    </main>

    <!-- Config Modal -->
    <Suspense>
      <Transition name="modal">
        <ConfigModal
          v-if="showConfigGuide"
          @close="closeConfigGuide"
        />
      </Transition>
    </Suspense>

    <!-- Gallery View -->
    <Suspense>
      <GalleryView
        v-if="showGallery"
        :is-open="showGallery"
        @close="toggleGallery"
      />
    </Suspense>

    <!-- Toast Notification -->
    <ToastNotification />

    <!-- PWA Update Prompt -->
    <UpdatePrompt />
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--gradient-bg);
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
