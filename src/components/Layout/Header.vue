<template>
  <header class="header" role="banner">
    <a href="#main-content" class="skip-link">{{ t('skipToContent') }}</a>
    <div class="header-content">
      <div class="header-left">
        <button
          @click="$emit('toggle-sidebar')"
          class="btn-icon"
          :aria-label="t('history')"
          :title="t('history')"
        >
          <Menu :size="20" />
        </button>

        <div class="logo-section">
          <h1 class="logo-text">
            <span class="logo-text-primary">{{ t('imageGen') }}</span>
            <span class="logo-text-secondary">Workspace</span>
          </h1>
        </div>
      </div>

      <nav class="header-right" :aria-label="t('mainNav')">
        <button
          @click="handleNewChat"
          class="btn-secondary header-action"
          :aria-label="t('newChat')"
          :title="t('newChat')"
        >
          <Plus :size="18" />
          <span class="btn-label">{{ t('newChat') }}</span>
        </button>

        <button
          @click="$emit('toggle-gallery')"
          class="btn-icon"
          :aria-label="t('gallery')"
          :title="t('gallery')"
        >
          <ImageIcon :size="20" />
        </button>

        <button
          @click="$emit('toggle-config')"
          class="btn-icon"
          :aria-label="t('apiConfig')"
          :title="t('apiConfig')"
        >
          <Settings :size="20" />
        </button>

        <ThemeToggle />
        <ExportImportPanel />
        <button
          v-if="chatStore.messageCount > 0"
          @click="handleClearChat"
          class="btn-icon danger"
          :aria-label="t('clearChat')"
          :title="t('clearChat')"
        >
          <Trash2 :size="20" />
        </button>
      </nav>
    </div>

    <!-- Clear Chat Confirm -->
    <ConfirmModal
      :is-open="showClearConfirm"
      :title="t('clearChat')"
      :message="t('clearChatConfirm')"
      :confirm-text="t('clear')"
      type="danger"
      @confirm="confirmClearChat"
      @cancel="showClearConfirm = false"
    />
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Menu, Plus, Settings, Trash2, ImageIcon } from 'lucide-vue-next'
import ThemeToggle from './ThemeToggle.vue'
import ExportImportPanel from '../Chat/ExportImportPanel.vue'
import ConfirmModal from '../Common/ConfirmModal.vue'
import { useChat } from '../../composables/useChat'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const emit = defineEmits<{
  'toggle-config': []
  'toggle-sidebar': []
  'toggle-gallery': []
}>()

const { chatStore, clearChat, startNewChat } = useChat()
const showClearConfirm = ref(false)

async function handleNewChat() {
  try {
    await startNewChat()
  } catch (error) {
    console.error('Start new chat failed:', error)
  }
}

function handleClearChat() {
  showClearConfirm.value = true
}

async function confirmClearChat() {
  try {
    await clearChat()
    showClearConfirm.value = false
  } catch (error) {
    console.error('Clear chat failed:', error)
  }
}
</script>

<style scoped>
.skip-link {
  position: absolute;
  top: -100%;
  left: 16px;
  z-index: 100;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: top var(--transition-fast);
}

.skip-link:focus {
  top: 8px;
}

.header {
  height: var(--header-height);
  background: color-mix(in srgb, var(--color-bg-primary) 92%, transparent);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 30;
  flex-shrink: 0;
  backdrop-filter: blur(14px);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 16px;
  max-width: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-section {
  display: flex;
  align-items: center;
}

.logo-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.logo-text-primary {
  letter-spacing: 0;
}

.logo-text-secondary {
  color: var(--color-text-tertiary);
  font-size: 13px;
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.header-action {
  padding-inline: 14px;
}

.btn-icon.danger:hover {
  background: #fef2f2;
  color: var(--color-error);
}

:root.dark .btn-icon.danger:hover {
  background: #450a0a;
}

@media (min-width: 640px) {
  .header-left {
    gap: 12px;
  }

  .header-right {
    gap: 8px;
  }

  .logo-text {
    font-size: 16px;
  }
}
</style>
