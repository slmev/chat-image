<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted } from 'vue'
import Header from './components/Layout/Header.vue'
import ChatContainer from './components/Chat/ChatContainer.vue'
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
const showConfig = ref(!configStore.isConfigured)
const showSidebar = ref(false)
const showGallery = ref(false)

onMounted(async () => {
  if (!isTauriRuntime()) return

  await initializeDesktopPersistence()
  await Promise.all([
    configStore.hydrateFromPersistence(),
    chatStore.hydrateFromPersistence(),
  ])
  showConfig.value = !configStore.isConfigured
})

function toggleConfig() {
  showConfig.value = !showConfig.value
}

function toggleSidebar() {
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
          v-if="showSidebar"
          :is-open="showSidebar"
          @close="closeSidebar"
        />
      </Suspense>

      <!-- Chat Area -->
      <div class="chat-area">
        <ChatContainer />
      </div>
    </main>

    <!-- Config Modal -->
    <Suspense>
      <Transition name="modal">
        <ConfigModal
          v-if="showConfig"
          @close="toggleConfig"
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
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
